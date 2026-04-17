import sys, json
sys.path.insert(0, r'D:\Weiblocks\Bot_App')
from deploy_helper import run, upload_file

cookies = [
{"domain":".google.com","expirationDate":1781635275.60083,"name":"__Secure-BUCKET","path":"/","secure":True,"value":"CPQC"},
{"domain":"www.google.com","expirationDate":1776407603,"name":"OTZ","path":"/","secure":True,"value":"8525193_36_36__36_"},
{"domain":".google.com","expirationDate":1810382055.396363,"name":"SID","path":"/","secure":False,"value":"g.a0008whYTYHhfmoKDG78cWPfNwTvUP-8-MpUoOAFttFNhr9fdQfNjRYONnWESa3wksmW5WZfUwACgYKAT0SARUSFQHGX2MiNJQ2E7sqzp3NCJ4jKlKfeRoVAUF8yKrUoKmbSKC3CVk6LJzzwwvI0076"},
{"domain":".google.com","expirationDate":1810382055.396647,"name":"__Secure-1PSID","path":"/","secure":True,"value":"g.a0008whYTYHhfmoKDG78cWPfNwTvUP-8-MpUoOAFttFNhr9fdQfNm5MEr0T7N1Fn1IwcJbk1oAACgYKAbYSARUSFQHGX2Mi8oYpTdP0gDD3_lSmr8b6GRoVAUF8yKroZCUHjX1N6hjUGpEeQBLF0076"},
{"domain":".google.com","expirationDate":1810382055.396912,"name":"__Secure-3PSID","path":"/","secure":True,"value":"g.a0008whYTYHhfmoKDG78cWPfNwTvUP-8-MpUoOAFttFNhr9fdQfNVlRYcGlPasvMNDi3nnDC6AACgYKAacSARUSFQHGX2Mi3vPYG-Fhuk-KvPqT4GUbLxoVAUF8yKoIPy4-1BvE74zd9ULYga6I0076"},
{"domain":".google.com","expirationDate":1810382055.3976,"name":"HSID","path":"/","secure":False,"value":"Ao3-iFOJn2I0MpQHE"},
{"domain":".google.com","expirationDate":1810382055.39783,"name":"SSID","path":"/","secure":True,"value":"AN85otAN1usRqXvsL"},
{"domain":".google.com","expirationDate":1810382055.398048,"name":"APISID","path":"/","secure":False,"value":"uHtvwWTPDDi6d5rj/AIilG4IbGwI2DT3E5"},
{"domain":".google.com","expirationDate":1810382055.39826,"name":"SAPISID","path":"/","secure":True,"value":"VaipqzYgj8_fYPkN/AhcVzPySDrsXWDCde"},
{"domain":".google.com","expirationDate":1810382055.398482,"name":"__Secure-1PAPISID","path":"/","secure":True,"value":"VaipqzYgj8_fYPkN/AhcVzPySDrsXWDCde"},
{"domain":".google.com","expirationDate":1810382055.398744,"name":"__Secure-3PAPISID","path":"/","secure":True,"value":"VaipqzYgj8_fYPkN/AhcVzPySDrsXWDCde"},
{"domain":".google.com","expirationDate":1781635275.010308,"name":"AEC","path":"/","secure":True,"value":"AaJma5tSs4qof_fKGvRYuoK-MSBFcWwhSVeDKon8vuc9qRG3hQf9m8ziQw"},
{"domain":".google.com","expirationDate":1807793686.331359,"name":"__Secure-1PSIDTS","path":"/","secure":True,"value":"sidts-CjIBWhotCcQyMjYCa872Bt6cuXBsD3PFKHbXJEDy8ts80ntwB61rB3gI_HFS1ahTheyNRBAA"},
{"domain":".google.com","expirationDate":1807793686.331746,"name":"__Secure-3PSIDTS","path":"/","secure":True,"value":"sidts-CjIBWhotCcQyMjYCa872Bt6cuXBsD3PFKHbXJEDy8ts80ntwB61rB3gI_HFS1ahTheyNRBAA"},
{"domain":".google.com","expirationDate":1807794180.831006,"name":"SIDCC","path":"/","secure":False,"value":"AKEyXzWD_b3xTjesDlKfWWSg4PphOL8KUo5kxzbBF5EK3MWqFRcCf0aIjYfs4re18NUJOHZ6wg"},
{"domain":".google.com","expirationDate":1807794180.831214,"name":"__Secure-1PSIDCC","path":"/","secure":True,"value":"AKEyXzW5lxGZj3MDr7B1LEpCUKB50O-wfotdXh2IZkAg8n4FblbXs2SQ-51nOMdHSmA8EfN-bA"},
{"domain":".google.com","expirationDate":1807794189.306846,"name":"__Secure-3PSIDCC","path":"/","secure":True,"value":"AKEyXzXQRsYx_g5xDhLgL7I-otHY7M4nnFoMq6Nffwc8KMp8K3OVPETbeQaCPKA5RRJJjNO_d84"},
{"domain":".youtube.com","expirationDate":1810817168.505646,"name":"__Secure-3PAPISID","path":"/","secure":True,"value":"VaipqzYgj8_fYPkN/AhcVzPySDrsXWDCde"},
{"domain":".youtube.com","expirationDate":1810817168.505995,"name":"__Secure-3PSID","path":"/","secure":True,"value":"g.a0008whYTYHhfmoKDG78cWPfNwTvUP-8-MpUoOAFttFNhr9fdQfNVlRYcGlPasvMNDi3nnDC6AACgYKAacSARUSFQHGX2Mi3vPYG-Fhuk-KvPqT4GUbLxoVAUF8yKoIPy4-1BvE74zd9ULYga6I0076"},
{"domain":".youtube.com","expirationDate":1791809056.152598,"name":"__Secure-BUCKET","path":"/","secure":True,"value":"CJoG"},
{"domain":".youtube.com","expirationDate":1776258856.152884,"name":"GPS","path":"/","secure":True,"value":"1"},
{"domain":".youtube.com","expirationDate":1807793168.504721,"name":"__Secure-1PSIDTS","path":"/","secure":True,"value":"sidts-CjUBWhotCc08RdQq9Uyjq_KWF1u5HInRgIFpaWwzdplnk2Q-QmnaEm7qe3qwRCDyuSO5gqaraxAA"},
{"domain":".youtube.com","expirationDate":1807793168.505024,"name":"__Secure-3PSIDTS","path":"/","secure":True,"value":"sidts-CjUBWhotCc08RdQq9Uyjq_KWF1u5HInRgIFpaWwzdplnk2Q-QmnaEm7qe3qwRCDyuSO5gqaraxAA"},
{"domain":".youtube.com","expirationDate":1810818222.575912,"name":"PREF","path":"/","secure":True,"value":"f4=4000000&f6=40000000&tz=Asia.Karachi&f7=100&f2=8000000"},
{"domain":".youtube.com","expirationDate":1807794219.044966,"name":"__Secure-3PSIDCC","path":"/","secure":True,"value":"AKEyXzXKJfi0C8qYEf52fCUcAmS0OJUAcJmnsU4sQGFHHNUtBvVJwJ-HFgEacQaaOENX2R5OAw"},
{"domain":".youtube.com","expirationDate":1791810219.04432,"name":"VISITOR_INFO1_LIVE","path":"/","secure":True,"value":"olnFdwFGoKU"},
{"domain":".youtube.com","expirationDate":1791810219.04449,"name":"VISITOR_PRIVACY_METADATA","path":"/","secure":True,"value":"CgJQSxIEGgAgDg%3D%3D"},
{"domain":".youtube.com","expirationDate":1791809056.153503,"name":"__Secure-ROLLOUT_TOKEN","path":"/","secure":True,"value":"CMbT3dXQ5aCPahCw-4Wwy4GSAxjm8_CW8e-TAw%3D%3D"},
{"domain":".youtube.com","expirationDate":1791809062.799745,"name":"__Secure-YNID","path":"/","secure":True,"value":"17.YT=iz1K5kQMNIHGPg_sbABUPhtb7KM-rHm1lpa-I6XGKTMWfBI_0MdLCsQ9_CxD0gQqotaPnqI08fn2Fgl8tE4_ZNlyPJa-epIvix-ECAbLjeqc0NkO5SRo24HfaN8br9RyL1RjzjB7xYnWb-11CxWRNz4LaOAKF0Oc83D_B7fk7HmDAK65Gj2jOm_EBqyely1h-Hv9TOo7hJovpIcNHErB1diCeJlfGF__ANBiIW7r8E_O3zElJ-l7QMLIprsrZZxjs6BOv_imFAv7Cmmd3umJyBIiQvzVlgJQ0SC39aaTy9_y8ykI-gWgIDd6c5HwTrHtuGqjOP6BXWQlGbZ0NU7T6g"},
{"domain":".youtube.com","expirationDate":1800000000,"name":"YSC","path":"/","secure":True,"value":"fe0XHWsWdHI"},
]

lines = ['# Netscape HTTP Cookie File', '# https://curl.haxx.se/rfc/cookie_spec.html', '# This is a generated file! Do not edit.', '']
for c in cookies:
    domain = c['domain']
    subdomain = 'TRUE' if domain.startswith('.') else 'FALSE'
    path = c.get('path', '/')
    secure = 'TRUE' if c.get('secure', False) else 'FALSE'
    exp = int(c.get('expirationDate', 0))
    lines.append(f"{domain}\t{subdomain}\t{path}\t{secure}\t{exp}\t{c['name']}\t{c['value']}")

cookies_txt = '\n'.join(lines)
print(f"Built {len(cookies)} cookie entries")

with open(r'D:\Weiblocks\Bot_App\youtube_cookies.txt', 'w') as f:
    f.write(cookies_txt)

upload_file(r'D:\Weiblocks\Bot_App\youtube_cookies.txt', '/opt/bottradeapp/backend/youtube_cookies.txt')
print("Uploaded!")
