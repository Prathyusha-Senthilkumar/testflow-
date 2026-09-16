const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) { 
      results.push(file);
    }
  });
  return results;
}
const files = walk('./src');
let changedFiles = 0;
files.forEach(f => {
  let original = fs.readFileSync(f, 'utf8');
  let content = original;
  
  const replaceFunc = (match, classes) => {
    if (classes.match(/\b(bg-indigo-600|bg-indigo-50|border)\b/) && classes.match(/\b(py-[0-9]+)\b/) && (classes.match(/\b(text-center)\b/) || classes.match(/\b(px-[0-9]+)\b/))) {
      let newClasses = classes.replace(/\brounded(-md)?\b/g, 'rounded-lg');
      return match.replace(classes, newClasses);
    }
    return match;
  };

  content = content.replace(/className="([^"]+)"/g, replaceFunc);
  content = content.replace(/className=\{`([^`]+)`\}/g, replaceFunc);

  if (content !== original) {
    fs.writeFileSync(f, content);
    changedFiles++;
    console.log('Updated ' + f);
  }
});
console.log('Total files updated in pass 2: ' + changedFiles);
