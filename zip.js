const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 获取 package.json 中的版本号
const pkg = require('./package.json');
const version = pkg.version || '1.0.0';
const zipName = `TBE-v${version}.zip`;

// 确保在项目根目录运行
const output = fs.createWriteStream(path.join(__dirname, zipName));
const archive = archiver('zip', {
  zlib: { level: 9 } // 最高压缩级别
});

output.on('close', function() {
  console.log('\x1b[32m%s\x1b[0m', `\n✅ 打包完成！`);
  console.log(`文件名: ${zipName}`);
  console.log(`文件大小: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
  console.log(`输出路径: ${path.join(__dirname, zipName)}\n`);
});

archive.on('error', function(err) {
  throw err;
});

// 关联输出流
archive.pipe(output);

// 将 dist 目录内容添加到 zip 根目录
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  archive.directory(distPath, false);
} else {
  console.error('\x1b[31m%s\x1b[0m', '❌ 错误: dist 目录不存在，请先运行 npm run build');
  process.exit(1);
}

// 完成打包
archive.finalize();
