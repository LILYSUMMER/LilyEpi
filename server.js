const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get local IP address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
        const addresses = interfaces[interfaceName];
        for (const address of addresses) {
            if (address.family === 'IPv4' && !address.internal) {
                return address.address;
            }
        }
    }
    return '127.0.0.1';
}

const options = {
    key: fs.readFileSync('ssl/private.key'),
    cert: fs.readFileSync('ssl/certificate.crt')
};

const server = https.createServer(options, function (req, res) {
    // 요청된 URL을 파일 경로로 변환
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './landing.html';
    }

    // CORS 헤더 추가
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 파일 확장자에 따른 Content-Type 설정
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm',
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.patt': 'text/plain'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // 파일 읽기 및 응답
    fs.readFile(filePath, function(error, content) {
        if (error) {
            if(error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server Error: '+error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const port = 3000;
const localIp = getLocalIpAddress();

server.listen(port, '0.0.0.0', function() {
    console.log(`Server running at:`);
    console.log(`- Local: https://localhost:${port}/`);
    console.log(`- Network: https://${localIp}:${port}/`);
    console.log('\nUse the Network URL on your mobile device');
    console.log('You might need to accept the self-signed certificate in your browser');
}); 