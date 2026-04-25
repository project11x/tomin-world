const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const dataFile = path.join(projectDir, 'data.js');

// Helper to determine file type easily
function getFileMeta(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    let isVideo = false;
    let type = "File";
    
    if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) {
        isVideo = true;
        type = ext === '.mov' ? 'QuickTime Movie' : 'Video';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic'].includes(ext)) {
        type = 'Image';
    } else if (ext === '.txt') {
        type = 'Text Document';
    } else if (ext === '.pdf') {
        type = 'PDF Document';
    } else if (ext === '.mp3' || ext === '.wav') {
        type = 'Audio';
    }
    return { isVideo, type };
}

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format date
function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function generateData() {
    const portfolioData = {};
    const items = fs.readdirSync(projectDir);

    for (const item of items) {
        // Skip hidden files/folders and self
        if (item.startsWith('.') || item === 'node_modules') continue;
        
        const itemPath = path.join(projectDir, item);
        const stat = fs.statSync(itemPath);

        // Process only folders
        if (stat.isDirectory()) {
            if (item === 'TOMIN INDEX.TXT') {
                // Special handling for the magazine folder array
                portfolioData[item] = [];
                const magazines = fs.readdirSync(itemPath);
                for (const mag of magazines) {
                    if (mag.startsWith('.')) continue;
                    const magPath = path.join(itemPath, mag);
                    const magStat = fs.statSync(magPath);
                    if (magStat.isDirectory()) {
                        // Describe it as a magazine type item inside TOMIN INDEX.TXT
                        portfolioData[item].push({
                            name: mag,
                            type: 'Magazine',
                            size: '--',
                            date: formatDate(magStat.mtime),
                            src: '',
                            isVideo: false,
                            isMagazine: true
                        });
                        
                        // Now parse the images inside the magazine
                        const magKey = `${item}/${mag}`;
                        portfolioData[magKey] = [];
                        const magFiles = fs.readdirSync(magPath);
                        for (const file of magFiles) {
                            if (file.startsWith('.')) continue;
                            const filePath = path.join(magPath, file);
                            const fileStat = fs.statSync(filePath);
                            if (fileStat.isFile()) {
                                const meta = getFileMeta(file);
                                portfolioData[magKey].push({
                                    name: file,
                                    type: meta.type,
                                    size: formatBytes(fileStat.size),
                                    date: formatDate(fileStat.mtime),
                                    src: `${encodeURIComponent(item)}/${encodeURIComponent(mag)}/${encodeURIComponent(file)}`,
                                    isVideo: meta.isVideo
                                });
                            }
                        }
                        portfolioData[magKey].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                    }
                }
                // Sort magazines alphabetically
                portfolioData[item].sort((a, b) => a.name.localeCompare(b.name));
            } else {
                portfolioData[item] = [];
                const folderFiles = fs.readdirSync(itemPath);
                
                for (const file of folderFiles) {
                    if (file.startsWith('.')) continue; // ignore .DS_Store, etc.
                    
                    const filePath = path.join(itemPath, file);
                    const fileStat = fs.statSync(filePath);
                    
                    // Only process files inside that folder
                    if (fileStat.isFile()) {
                        const meta = getFileMeta(file);
                        portfolioData[item].push({
                            name: file,
                            type: meta.type,
                            size: formatBytes(fileStat.size),
                            date: formatDate(fileStat.mtime),
                            // src should be relative to where the HTML is, e.g., "milano/pic.jpg"
                            src: `${encodeURIComponent(item)}/${encodeURIComponent(file)}`,
                            isVideo: meta.isVideo
                        });
                    }
                }
                
                // Sort videos to the top, then alphabetically
                portfolioData[item].sort((a, b) => {
                    if (a.isVideo && !b.isVideo) return -1;
                    if (!a.isVideo && b.isVideo) return 1;
                    return a.name.localeCompare(b.name);
                });
            }
        }
    }

    let globalLatestTime = 0;
    for (const key in portfolioData) {
        portfolioData[key].forEach(item => {
            const time = new Date(item.date).getTime();
            if (time > globalLatestTime) globalLatestTime = time;
        });
    }

    const output = `// Auto-generated by sync.js\n// DO NOT EDIT THIS FILE MANUALLY\nconst portfolioData = ${JSON.stringify(portfolioData, null, 2)};\nconst globalLatestFileTime = ${globalLatestTime};`;
    fs.writeFileSync(dataFile, output);
    console.log(`✅ data.js updated! Found ${Object.keys(portfolioData).length} real folders.`);
}

// Run mapping
generateData();

// Simple watch mode if requested via flag
if (process.argv.includes('--watch')) {
    console.log('👀 Watching local folders for changes. Drop your files in the folders, the site will update automatically...');
    
    let debounceTimer;
    fs.watch(projectDir, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.startsWith('.') && filename !== 'data.js' && filename !== 'sync.js' && !filename.endsWith('.html')) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                try {
                    generateData();
                } catch (e) {
                    console.error("Error refreshing data:", e);
                }
            }, 300); // 300ms debounce
        }
    });
}
