const { execSync } = require("child_process");

const fs = require("fs");
const path = require("path");

const root = __dirname;
const www = path.join(root, "www");

// www klasörünü temizle ve yeniden oluştur
if (fs.existsSync(www)) {
    fs.rmSync(www, { recursive: true, force: true });
}

fs.mkdirSync(www, { recursive: true });

// Kopyalanacak dosya ve klasörler
const items = [
    "index.html",
    "manifest.json",
    "sw.js",
    "icon-192.png",
    "icon-512.png",
    "css",
    "js",
    "legal",
    "dailyMessages.js"
];

items.forEach(item => {

    const source = path.join(root, item);
    const destination = path.join(www, item);

    fs.cpSync(source, destination, {
        recursive: true
    });
});

execSync(
    "npx esbuild js/capacitor.js --bundle --format=esm --outfile=www/js/capacitor.js",
    { stdio: "inherit" }
);