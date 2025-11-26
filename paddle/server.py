from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
from fastapi.concurrency import run_in_threadpool
import tempfile
import os
import logging

logger = logging.getLogger("uvicorn")

app = FastAPI(
    title="PaddleOCR Docker Service",
    description="Simple PaddleOCR HTTP API (lang=ch, CPU)",
    version="1.0.0",
)

logger.info(">>> Initializing PaddleOCR (lang=ch, use_angle_cls=True)")
ocr = PaddleOCR(lang="ch", use_angle_cls=True)
logger.info(">>> PaddleOCR initialized successfully")


@app.get("/health")
def health() -> dict:
    logger.info(">>> /health called")
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)):
    logger.info(">>> /ocr called, filename=%s, content_type=%s", file.filename, file.content_type)

    suffix = os.path.splitext(file.filename or "")[-1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        logger.info(">>> file read done, size=%d bytes, tmp_suffix=%s", len(content), suffix)
        tmp.write(content)
        tmp_path = tmp.name

    logger.info(">>> temp file created: %s", tmp_path)

    try:
        logger.info(">>> calling PaddleOCR.ocr on %s", tmp_path)
        result = await run_in_threadpool(ocr.ocr, tmp_path)
        logger.info(">>> PaddleOCR.ocr finished, raw_result_len=%d", len(result))

        all_texts: list[str] = []

        for page_idx, page in enumerate(result):
            # 新版本：page 是 dict，里面有 rec_texts / rec_scores / rec_polys 等
            if isinstance(page, dict) and "rec_texts" in page:
                rec_texts = page.get("rec_texts") or []
                logger.info(">>> parsing page %d with %d texts (new-style)", page_idx, len(rec_texts))

                for text in rec_texts:
                    if text:  # 过滤掉空字符串
                        all_texts.append(str(text))

            # 兼容老版本：[[box, [text, score]], ...]
            elif isinstance(page, (list, tuple)):
                logger.info(">>> parsing page %d as old-style list", page_idx)
                for item in page:
                    if (
                        isinstance(item, (list, tuple))
                        and len(item) >= 2
                    ):
                        info = item[1]
                        if isinstance(info, (list, tuple)) and len(info) >= 1:
                            text = info[0]
                        else:
                            text = info
                        if text:
                            all_texts.append(str(text))
                    else:
                        logger.warning(">>> unexpected item format in old-style page: %s", item)
            else:
                logger.warning(">>> unexpected page type: %s", type(page))

        joined_text = "\n".join(all_texts)
        logger.info(">>> /ocr returning %d lines, total_chars=%d", len(all_texts), len(joined_text))

        # 如果你只想要 text，可以只返回 {"text": joined_text}
        return JSONResponse({
            "text": joined_text,
            "lines": all_texts,
        })
    except Exception as e:
        logger.exception("!!! Error in /ocr: %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            logger.info(">>> temp file removed: %s", tmp_path)