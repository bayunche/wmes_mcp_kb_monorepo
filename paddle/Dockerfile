# 使用飞桨官方 PaddlePaddle CPU 镜像
FROM ccr-2vdh3abv-pub.cnc.bj.baidubce.com/paddlepaddle/paddle:3.0.0

WORKDIR /app

# 安装必要系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

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
