FROM python:3.11-slim

WORKDIR /app

# 系统依赖（reportlab 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# 通过 start.py 启动：迁移在 lifespan 内自动执行（幂等），
# 绑定地址/端口由 HOST / PORT 环境变量决定（容器默认 0.0.0.0:8000）。
CMD ["python", "start.py"]
