# 部署到云服务器（taouuuuuu.tech + 43.167.198.21）

纯静态站点，不需要 Node/Python 后端，一个静态文件服务器即可。推荐 **Caddy**：自动申请并续期 HTTPS 证书，配置只有几行。

## 0. 前置检查

- **服务器地域**：如果服务器在中国大陆境内，域名解析到 80/443 端口需要先做 ICP 备案；如果是中国香港/海外机器（43.167.x 段常见于腾讯云轻量海外机型），则无需备案，直接可用。
- **安全组/防火墙**：在云平台控制台放行 TCP 80 和 443 端口。

## 1. DNS 解析

在域名管理后台（你的 DNS 服务商）添加一条 A 记录：

| 主机记录 | 类型 | 记录值 |
|---|---|---|
| `picker`（或 `@` 用主域） | A | `43.167.198.21` |

以 `picker.taouuuuuu.tech` 为例，生效后 `ping picker.taouuuuuu.tech` 应解析到服务器 IP。

## 2. 上传代码到服务器

方式一（推荐，先把项目 push 到 GitHub 后）：

```bash
ssh root@43.167.198.21
git clone https://github.com/Super-recruit-wwt/random-name-picker.git /opt/name-picker
# 以后更新只需：cd /opt/name-picker && git pull
```


方式二（本地直接上传，在 Windows Git Bash 里执行）：

```bash
scp -r /f/thinking/002随机抽名字代码 root@43.167.198.21:/opt/name-picker
```

## 3. 安装并配置 Caddy（推荐）

```bash
# Ubuntu/Debian
apt update && apt install -y caddy

# 编辑配置
cat > /etc/caddy/Caddyfile <<'EOF'
picker.taouuuuuu.tech {
    root * /opt/name-picker
    file_server
    encode gzip
}
EOF

systemctl reload caddy
```

Caddy 会自动为 `picker.taouuuuuu.tech` 申请 Let's Encrypt 证书并强制 HTTPS。完成。

## 4. 备选：Nginx + Certbot

参考本目录的 `nginx.conf`，放入 `/etc/nginx/sites-available/name-picker` 并软链到 `sites-enabled`，然后：

```bash
apt install -y nginx certbot python3-certbot-nginx
nginx -t && systemctl reload nginx
certbot --nginx -d picker.taouuuuuu.tech   # 自动签证书并改配置
```

## 5. 验证

浏览器访问 `https://picker.taouuuuuu.tech`，应看到待机界面；空格开始滚动即部署成功。

## 日常更新名单

改 `data/names.csv` 后在服务器上 `git pull`（方式一），或重新 `scp` 单个文件：

```bash
scp /f/thinking/002随机抽名字代码/data/names.csv root@43.167.198.21:/opt/name-picker/data/names.csv
```
