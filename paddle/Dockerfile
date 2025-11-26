# 使用飞桨官方 PaddlePaddle GPU 镜像
FROM ccr-2vdh3abv-pub.cnc.bj.baidubce.com/paddlepaddle/paddle:3.0.0-gpu-cuda11.8-cudnn8.9-trt8.6

WORKDIR /app

# 安装必要系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# 关键步骤：先用 --ignore-installed 覆盖安装一个新版本的 PyYAML
RUN pip3 install --no-cache-dir --ignore-installed "PyYAML>=6.0"

# 安装 Python 依赖
RUN pip3 install --no-cache-dir \
    "paddleocr>=2.7" \
    fastapi \
    "uvicorn[standard]" \
    pillow \
    python-multipart

COPY server.py /app/server.py

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
