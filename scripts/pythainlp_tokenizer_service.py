from fastapi import FastAPI
from pydantic import BaseModel
from pythainlp import word_tokenize

app = FastAPI(title="PyThaiNLP Tokenizer Service")


class TokenizeRequest(BaseModel):
    text: str


@app.post("/tokenize")
async def tokenize(req: TokenizeRequest):
    # Use PyThaiNLP newmm tokenizer and drop whitespace tokens
    tokens = word_tokenize(req.text or "", engine="newmm", keep_whitespace=False)
    return {"tokens": tokens}


@app.get("/health")
async def health():
    return {"status": "ok"}
