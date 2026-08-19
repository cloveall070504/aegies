"""临时 mock：模拟一个可用的 Ollama 服务，用于验证「AI 增强模式」分支确实接通。
仅用于本地验证，不参与生产。"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

MODEL = "qwen2.5:7b"

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/api/tags":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"models": [{"name": MODEL}]}).encode())
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path == "/api/generate":
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(n) or b"{}")
            prompt = body.get("prompt", "")
            # 根据 prompt 关键词生成一段"像 AI"的旁白，证明 actor_reply 被填充
            reply = ("（AI 生成）我已审阅该操作：" + prompt[:60] +
                     "。综合安全规程判断，存在化学品暴露与明火风险，"
                     "应在通风橱内佩戴护目镜与防护手套操作，严禁近距离朝向人体。")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"response": reply}).encode())
        else:
            self.send_response(404); self.end_headers()

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 11435), H).serve_forever()
