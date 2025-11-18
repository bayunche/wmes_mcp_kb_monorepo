from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
from typing import List, Any
import tempfile
import os

app = FastAPI(
    title="PaddleOCR Docker Service",
    description="Simple PaddleOCR HTTP API (lang=ch, CPU)",
    version="1.0.0",
)

# 初始化 OCR 模型（中文 + 方向分类器），首次启动会自动下载模型
ocr = PaddleOCR(lang="ch", use_angle_cls=True)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)) -> Any:
    # 将上传的文件存到临时文件
    suffix = os.path.splitext(file.filename or "")[-1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # 调用 OCR
        result = ocr.ocr(tmp_path, cls=True)

        # 整理输出结构
        lines = []
        for line in result:
            for box, (text, score) in line:
                lines.append({
                    "text": text,
                    "score": float(score),
                    "box": box,  # 四点坐标
                })

        return JSONResponse({"result": lines})
    finally:
        # 删除临时文件
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
