#!/usr/bin/env python3
import sys
import requests
import json

GET_PLAYER_OPTIONS_URL = 'https://xmum.mediasitecloud.jp/Mediasite/PlayerService/PlayerService.svc/json/GetPlayerOptions'
OPEN_MEDIA_URL = 'https://xmum.mediasitecloud.jp/Mediasite/PlayerService/PlayerService.svc/json/ReportMediaOpen'
MEDIA_VIEW_URL = 'https://xmum.mediasitecloud.jp/Mediasite/PlayerService/PlayerService.svc/json/ReportMediaView'

with open(sys.argv[1], 'r') as file:
    har = json.load(file)

player_options = next(k['response']['content']['text']
    for k in har['log']['entries']
    if k['request']['url'] == GET_PLAYER_OPTIONS_URL)
player_options = json.loads(player_options)['d']

ticket = player_options['GlobalOptions']['PlaybackTicket']
url = player_options['IosAppDetectionOptions']['InBrowserContentUrl']
duration = int(player_options['Presentation']['Duration']) // 1000
print('ticket =', ticket)
print('url =', url)
print('duration =', duration)

def req(url: str, data: dict) -> str:
    return requests.post(url, json=data).text

print('Sending open media request...')
print(req(OPEN_MEDIA_URL, {
    "playbackTicket": ticket,
    "playerType": "Javascript",
    "mediaPlayerType": "HLSjs",
    "embeddedPlayer": True,
    "url": url
}))
print('Open media request sent, sending media view request...')
print(req(MEDIA_VIEW_URL, {
    "playbackTicket": ticket,
    "segments": [{ "StartTime": 0, "Duration": duration }],
    "bookmarkPosition": duration
}))
print('Done')
