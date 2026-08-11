from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
os.chdir('/Users/woodelight/Projects/ami-work')
class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
HTTPServer(('', 8080), H).serve_forever()
