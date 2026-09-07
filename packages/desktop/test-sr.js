const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({ 
    width: 600, 
    height: 400, 
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  
  const htmlPath = path.join(__dirname, '..', 'resources', 'test-mic.html');
  win.loadFile(htmlPath);
  
  win.webContents.on('did-finish-load', () => {
    console.log('Page loaded, checking SpeechRecognition...');
    
    win.webContents.executeJavaScript(`
      (function() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var info = {
          available: !!SR,
          name: SR ? (SR.name || 'unknown') : 'N/A',
          userAgent: navigator.userAgent
        };
        return JSON.stringify(info);
      })()
    `).then(result => {
      console.log('SpeechRecognition check:', result);
    }).catch(err => {
      console.log('Error checking SR:', err.message);
    });
  });
  
  setTimeout(() => {
    console.log('Test complete, quitting...');
    app.quit();
  }, 5000);
});
