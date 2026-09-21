
# -*- coding: utf-8 -*-
"""
publish.py —— 学习通作业聚合扩展的发布打包脚本

流程：
  1. 读取并校验源 manifest.json（必须是合法的 MV3 扩展清单）
  2. 自动递增 patch 版本号（如 1.0.0 -> 1.0.1），写回源 manifest.json 与发布包
  3. 调用 terser 压缩 app.js 与 background.js（只 compress、不 mangle，便于商店审核阅读）
  4. 复制 app.css / app.html / icon128.png 到 dist/（app.html / app.css 剥离注释）
  5. 校验发布包文件齐全、manifest 合法、压缩 JS 非空
  6. 将 dist/ 打成可上传微软商店的 .zip
  7. 同步 site/index.html 与 site/privacy.html 中的版本号（不打进 zip）

依赖：Node.js + terser（见 package.json）
用法：python publish.py
"""

import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

# 项目根目录（本文件所在目录）
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_MANIFEST = os.path.join(ROOT, "manifest.json")
DIST_DIR = os.path.join(ROOT, "dist")
# 需要原样复制的资源文件（JS 单独压缩，不在此列）
ASSET_FILES = ["app.css", "app.html", "icon128.png"]
# 需要原样复制的目录（含子目录整体复制，如语言包）
COPY_DIRS = ["_locales"]
# 需要压缩的 JS 文件
JS_FILES = ["app.util.js", "app.js", "background.js"]

# 发布包中需剥离注释的资源：正则按顺序应用，命中内容替换为空串
HTML_COMMENT_RX = re.compile(r'<!--.*?-->', re.DOTALL)
CSS_COMMENT_RX = re.compile(r'/\*.*?\*/', re.DOTALL)
BLANK_LINE_RX = re.compile(r'\n[ \t]+(?=\n)')
STRIP_COMMENT_RULES = {
    # app.html 无内联 style/script，只剥 HTML 注释；CSS_COMMENT_RX 仅用于 app.css
    "app.html": [HTML_COMMENT_RX],
    "app.css": [CSS_COMMENT_RX],
}


def log(msg):
    print(f"[publish] {msg}")


def fail(msg):
    print(f"[publish] 错误: {msg}", file=sys.stderr)
    sys.exit(1)


def load_manifest(path):
    if not os.path.isfile(path):
        fail(f"找不到 {path}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        fail(f"{path} 不是合法的 JSON: {e}")
    if data.get("manifest_version") != 3:
        fail("仅支持 Manifest V3 扩展 (manifest_version 必须为 3)")
    if "version" not in data or not re.fullmatch(r"\d+(\.\d+){0,3}", str(data["version"])):
        fail("manifest.json 缺少合法 version 字段（形如 1.0.0）")
    return data


def bump_version(version):
    """将 patch 位 +1。支持 1.0 / 1.0.0 / 1.0.0.0 等 Chrome 合法格式。"""
    parts = str(version).split(".")
    # 补齐到 3 段（major.minor.patch）
    while len(parts) < 3:
        parts.append("0")
    parts[-1] = str(int(parts[-1]) + 1)
    return ".".join(parts)


SITE_VERSION_FILES = [
    os.path.join(ROOT, "site", "index.html"),
    os.path.join(ROOT, "site", "privacy.html"),
]


def sync_site_version(new_version):
    """把站点页脚 / Hero 版本号改成与 manifest 一致。文件不存在则跳过。"""
    patterns = [
        (re.compile(r"当前版本 · v\d+(?:\.\d+){0,3}"), f"当前版本 · v{new_version}"),
        (re.compile(r"学习通作业聚合 · v\d+(?:\.\d+){0,3}"), f"学习通作业聚合 · v{new_version}"),
    ]
    for path in SITE_VERSION_FILES:
        if not os.path.isfile(path):
            log(f"跳过站点版本同步（文件不存在）: {path}")
            continue
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        updated = text
        for rx, repl in patterns:
            updated = rx.sub(repl, updated)
        if updated == text:
            log(f"站点版本未匹配到可替换文案: {os.path.relpath(path, ROOT)}")
            continue
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(updated)
        log(f"站点版本已同步: {os.path.relpath(path, ROOT)} -> v{new_version}")


TERSER_BIN = os.path.join(ROOT, "node_modules", "terser", "bin", "terser")


def minify_js(src_path, dist_path):
    """用 terser 压缩单个 JS 文件。返回压缩后字节数。"""
    if not os.path.isfile(src_path):
        fail(f"缺少源文件 {src_path}")
    if not os.path.isfile(TERSER_BIN):
        fail(f"缺少 terser，请先执行: npm install")
    try:
        # 直接调用 node 运行 terser 入口（跨平台，避免 Windows 下 npx/.cmd 解析问题）
        result = subprocess.run(
            ["node", TERSER_BIN, src_path,
             "--compress",
             "--output", dist_path, "--comments", "false"],
            cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True,
        )
    except FileNotFoundError:
        fail("node 不可用：未安装 Node.js 或不在 PATH 中，请先安装")
    except OSError as e:
        fail(f"无法启动 node: {e}")
    except subprocess.CalledProcessError as e:
        fail(f"terser 压缩失败: {src_path}\n{e.stderr}")
    size = os.path.getsize(dist_path)
    if size == 0:
        fail(f"terser 输出为空: {src_path}")
    return size


def build_zip(zip_path, dist_dir):
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for dirpath, _dirnames, filenames in os.walk(dist_dir):
            for name in sorted(filenames):
                full = os.path.join(dirpath, name)
                # 以 dist 内相对路径写入（如 _locales/zh_CN/messages.json），不包含 dist/ 顶层目录
                rel = os.path.relpath(full, dist_dir).replace(os.sep, "/")
                zf.write(full, rel)
                count += 1
    if count == 0:
        fail("dist 目录为空，未生成任何打包文件")
    return os.path.getsize(zip_path)


def main():
    # 1. 读取并校验 manifest，计算新版本
    manifest = load_manifest(SRC_MANIFEST)
    old_version = manifest["version"]
    new_version = bump_version(old_version)
    manifest["version"] = new_version
    log(f"版本号: {old_version} -> {new_version}")

    # 2. 准备 dist 目录（清空重建，避免残留旧文件）
    if os.path.isdir(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)

    # 3. 压缩 JS 并复制资源
    js_orig = js_min = 0
    for js in JS_FILES:
        src = os.path.join(ROOT, js)
        dst = os.path.join(DIST_DIR, js)
        orig = os.path.getsize(src)
        if orig <= 0:
            fail(f"源 JS 为空: {js}")
        min_size = minify_js(src, dst)
        js_orig += orig
        js_min += min_size
        log(f"压缩 {js}: {orig} -> {min_size} 字节 ({100 * min_size / orig:.0f}%)")

    for asset in ASSET_FILES:
        src = os.path.join(ROOT, asset)
        if not os.path.isfile(src):
            fail(f"缺少资源文件 {asset}")
        dst = os.path.join(DIST_DIR, asset)
        if asset in STRIP_COMMENT_RULES:
            with open(src, "r", encoding="utf-8") as f:
                text = f.read()
            for rx in STRIP_COMMENT_RULES[asset]:
                text = rx.sub("", text)
            text = BLANK_LINE_RX.sub("", text).lstrip()
            with open(dst, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            log(f"已剥离注释: {asset}")
        else:
            shutil.copy2(src, dst)
    log("资源文件已复制: " + ", ".join(ASSET_FILES))

    for d in COPY_DIRS:
        src = os.path.join(ROOT, d)
        if not os.path.isdir(src):
            fail(f"缺少目录 {src}")
        shutil.copytree(src, os.path.join(DIST_DIR, d))
    if COPY_DIRS:
        log("目录已复制: " + ", ".join(COPY_DIRS))

    # 4. 将新版本号写入发布包 manifest
    dist_manifest = os.path.join(DIST_DIR, "manifest.json")
    with open(dist_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 5. 校验发布包
    dist_manifest_data = load_manifest(dist_manifest)
    expected = set(ASSET_FILES) | set(JS_FILES) | set(COPY_DIRS) | {"manifest.json"}
    actual = set(os.listdir(DIST_DIR))
    missing = expected - actual
    if missing:
        fail(f"发布包缺少文件: {sorted(missing)}")
    extra = actual - expected
    if extra:
        fail(f"发布包存在多余文件: {sorted(extra)}")
    if dist_manifest_data["version"] != new_version:
        fail("发布包 manifest 版本号不一致")
    log(f"发布包校验通过（{len(actual)} 个文件，version={new_version}）")

    # 5b. 校验发布包 HTML/CSS 中不再残留任何注释标记
    for name in ("app.html", "app.css"):
        with open(os.path.join(DIST_DIR, name), "r", encoding="utf-8") as f:
            published = f.read()
        for marker in ("<!--", "/*"):
            if marker in published:
                fail(f"{name} 中仍残留注释标记: {marker}")
    log("注释剥离校验通过: app.html / app.css 无注释残留")

    # 6. 把新版本号写回源 manifest.json，保持源码与发布一致
    with open(SRC_MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 6b. 同步站点落地页 / 隐私政策上的版本号（不打进扩展 zip）
    sync_site_version(new_version)

    # 7. 打 zip 包（商店上传用）
    zip_path = os.path.join(ROOT, f"learning-extension-{new_version}.zip")
    zip_size = build_zip(zip_path, DIST_DIR)
    log(f"压缩包已生成: {zip_path} ({zip_size} 字节)")

    print("\n===== 发布完成 =====")
    print(f"  版本: {new_version}")
    print(f"  JS 压缩率: {100 * js_min / js_orig:.1f}%")
    print(f"  dist/: {DIST_DIR}")
    print(f"  压缩包: {zip_path}")


if __name__ == "__main__":
    main()
