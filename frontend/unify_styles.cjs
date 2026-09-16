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
  
  // 1. Replace blue with indigo globally
  content = content.replace(/blue-(\d{2,3})/g, 'indigo-$1');
  
  // 2. Standardize button border-radius to rounded-lg
  // Look for className="classes"
  content = content.replace(/className="([^"]+)"/g, (match, classes) => {
    if (classes.match(/\b(px-[0-9]+)\b/) && classes.match(/\b(py-[0-9]+)\b/) && classes.match(/\b(bg-|border)\b/)) {
      let newClasses = classes.replace(/\brounded(-md)?\b/g, 'rounded-lg');
      if (!newClasses.match(/\btext-(xs|sm|base|lg|xl)\b/)) {
        newClasses += ' text-sm';
      }
      return 'className="' + newClasses + '"';
    }
    return match;
  });

  // 3. Look for className={`classes`}
  content = content.replace(/className=\{`([^`]+)`\}/g, (match, classes) => {
    if (classes.match(/\b(px-[0-9]+)\b/) && classes.match(/\b(py-[0-9]+)\b/) && classes.match(/\b(bg-|border)\b/)) {
      let newClasses = classes.replace(/\brounded(-md)?\b/g, 'rounded-lg');
      return 'className={`' + newClasses + '`}';
    }
    return match;
  });

  if (content !== original) {
    fs.writeFileSync(f, content);
    changedFiles++;
    console.log('Updated ' + f);
  }
});
console.log('Total files updated: ' + changedFiles);
