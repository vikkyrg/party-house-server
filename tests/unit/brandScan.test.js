const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = ['node_modules', 'coverage', '.git', 'uploads', 'invoices', 'build', 'dist'];
const ALLOW_LIST = [
  // example: { file: 'someFile.js', reason: 'Some reason' }
  { file: 'brandScan.test.js', reason: 'Self reference in test' },
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (
        fullPath.endsWith('.js') ||
        fullPath.endsWith('.json') ||
        fullPath.endsWith('.md') ||
        fullPath.endsWith('.hbs') ||
        fullPath.endsWith('.env.example')
      ) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

describe('Brand Rename Verification Scan', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const allFiles = getAllFiles(rootDir);

  test('should not contain old brand references in the codebase', () => {
    const violations = [];

    const OLD_BRANDS = [
      'thebingetown',
      'The Binge Town',
      'thebingetown.com',
      'thebingetown-api',
      'THEBINGETOWN',
    ];

    allFiles.forEach(filePath => {
      const isAllowed = ALLOW_LIST.some(item => filePath.endsWith(item.file));
      if (isAllowed) return;

      const content = fs.readFileSync(filePath, 'utf8');

      OLD_BRANDS.forEach((brand) => {
        if (content.includes(brand) || content.toLowerCase().includes(brand.toLowerCase())) {
          // Additional check: maybe it's just 'cs_cinemas' matching if we searched poorly, but we are exact matching
          violations.push(`Found "${brand}" in ${filePath}`);
        }
      });
    });

    if (violations.length > 0) {
      console.error('Brand Scan Violations:', violations);
    }

    expect(violations.length).toBe(0);
  });
});
