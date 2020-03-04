/**
 * @type {Promise<chrome.windows.Window>}
 */
const currentWindowAsync = new Promise((resolve, _reject) => chrome.windows.getCurrent(resolve))

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
    const { type } = msg
    const w = await currentWindowAsync
    switch (type) {
        case 'getWindowState':
            sendResponse(w.state)
            break
        case 'setWindowState':
            console.debug('setwindowstate', msg)
            const { state } = msg
            chrome.windows.update(w.id, { state }, _w => sendResponse())
    }
})

console.log('Listening messages from background')
