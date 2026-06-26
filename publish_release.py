import os
import re
import sys
import urllib.request
import json

# 1. 检测 zip 文件是否存在
zip_name = "TBE-YouTube.zip"
if not os.path.exists(zip_name):
    print(f"❌ 错误：未找到 {zip_name} 文件。请先在终端运行 'npm run build' 并压缩它。")
    sys.exit(1)

# 2. 读取当前 git 配置解析 owner/repo
git_config_path = os.path.join(".git", "config")
if not os.path.exists(git_config_path):
    print("❌ 错误：未检测到 .git 目录，请确保是在 Git 仓库根目录下运行此脚本。")
    sys.exit(1)

repo_url = None
with open(git_config_path, "r", encoding="utf-8") as f:
    for line in f:
        if "url =" in line:
            repo_url = line.split("=")[-1].strip()
            break

if not repo_url:
    print("❌ 错误：无法从 .git/config 中解析出 remote origin URL。")
    sys.exit(1)

# 从 git URL 中提取 owner 和 repo
match = re.search(r"github\.com[:/]([^/]+)/([^/\.]+)", repo_url)
if not match:
    print(f"❌ 错误：无法解析 GitHub 仓库路径：{repo_url}")
    sys.exit(1)

owner, repo = match.group(1), match.group(2)
print(f"📊 检测到仓库：{owner}/{repo}")

# 3. 提示输入 Token
token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if not token:
    print("🔑 请输入具有 'repo' 权限的 GitHub Personal Access Token (PAT):")
    token = input().strip()

if not token:
    print("❌ 错误：必须提供 GitHub Token 才能进行发布。")
    sys.exit(1)

# 4. 创建 Release
tag_name = "v1.0.0"
release_name = "LingoFlow YouTube v1.0.0 - 稳定发布版"
body_text = """### 🎬 LingoFlow YouTube 双语字幕专业版扩展 (v1.0.0)

本安装包是已经编译打包好的 Chrome 插件。

#### 📥 安装步骤 (直接安装)
1. 下载下方的 `TBE-YouTube.zip`。
2. 解压下载的压缩包到本地任意目录（解压后请勿删除或移动该目录）。
3. 打开 Chrome 浏览器，访问 `chrome://extensions/` 进入扩展程序管理页面。
4. 开启页面右上角的 **“开发者模式”** 开关。
5. 点击左上角的 **“加载已解压的扩展程序”** 按钮，选择刚才解压出来的文件夹即可完成安装！

---
由 **LingoFlow Team** 用 ❤️ 构建"""

print(f"🚀 正在为 {owner}/{repo} 创建 GitHub Release {tag_name}...")

# 构造创建 release 请求
url = f"https://api.github.com/repos/{owner}/{repo}/releases"
data = {
    "tag_name": tag_name,
    "target_commitish": "main",
    "name": release_name,
    "body": body_text,
    "draft": False,
    "prerelease": False
}
req = urllib.request.Request(
    url,
    data=json.dumps(data).encode("utf-8"),
    headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as res:
        res_data = json.loads(res.read().decode("utf-8"))
        release_id = res_data["id"]
        html_url = res_data["html_url"]
        upload_url = res_data["upload_url"].split("{")[0] # 去掉模板参数
        print(f"✅ Release 创建成功！网页查看地址: {html_url}")
except Exception as e:
    print(f"❌ 创建 Release 失败，这可能是因为该 Release 已经存在。尝试获取现有 Release...")
    try:
        req_get = urllib.request.Request(
            f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag_name}",
            headers={
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github.v3+json"
            }
        )
        with urllib.request.urlopen(req_get) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            release_id = res_data["id"]
            upload_url = res_data["upload_url"].split("{")[0]
            print(f"👉 发现已有 Release，准备覆盖上传资源包...")
    except Exception as ex:
        print(f"❌ 无法连接到 GitHub API: {ex}")
        sys.exit(1)

# 5. 上传 zip 资产文件
print(f"📦 正在上传 {zip_name} 到 Release 资产...")
with open(zip_name, "rb") as f:
    zip_data = f.read()

upload_api_url = f"{upload_url}?name={zip_name}"
req_upload = urllib.request.Request(
    upload_api_url,
    data=zip_data,
    headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/zip",
        "Content-Length": str(len(zip_data))
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req_upload) as res:
        upload_res = json.loads(res.read().decode("utf-8"))
        print(f"🎉 成功！资源包已上传。")
        print(f"🔗 直接下载链接：{upload_res['browser_download_url']}")
except Exception as e:
    print(f"❌ 上传资源包失败：{e}")
    sys.exit(1)
