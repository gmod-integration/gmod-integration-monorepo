import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';

// Créez une version de __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function addJsExtension(dir) {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      addJsExtension(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/from\s+['"](\..*?)['"]/g, (match, importPath) => {
        if (!importPath.endsWith('.js')) {
          return `from '${importPath}.js'`;
        }
        return match;
      });
      fs.writeFileSync(fullPath, content);
    }
  });
}

addJsExtension(path.join(__dirname, 'dist'));
