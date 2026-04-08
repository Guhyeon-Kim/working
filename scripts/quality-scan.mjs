import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const targetExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const antiPatternChecks = [
  { label: 'console.log', regex: /\bconsole\.log\s*\(/ },
  { label: 'TypeScript any (: any)', regex: /:\s+any\b/ },
  { label: 'TypeScript any (as any)', regex: /\bas\s+any\b/ },
  { label: 'TypeScript any (<any>)', regex: /<\s*any\s*>/ },
  { label: 'Hardcoded localhost URL', regex: /\b(?:localhost:\d+|127\.0\.0\.1)\b/ },
  { label: 'TODO comment', regex: /\bTODO\b/ },
  { label: 'FIXME comment', regex: /\bFIXME\b/ },
];

function walk(dirPath, results) {
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, results);
      continue;
    }

    if (targetExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

function toRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function collectExports(content) {
  const names = new Set();
  const patterns = [
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+default\s+class\s+([A-Za-z_$][\w$]*)/g,
    /export\s+default\s+(?!function\b|class\b)([A-Za-z_$][\w$]*)/g,
    /export\s*\{\s*([^}]+)\s*\}/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern.source.includes('[^}]+')) {
        const parts = match[1].split(',');
        for (const part of parts) {
          const cleaned = part.trim();
          if (!cleaned) {
            continue;
          }
          const aliasMatch = cleaned.match(/^(?:([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*))$/);
          if (!aliasMatch) {
            continue;
          }
          names.add(aliasMatch[2] || aliasMatch[3] || aliasMatch[1]);
        }
      } else if (match[1]) {
        names.add(match[1]);
      }
    }
  }

  return Array.from(names);
}

function collectImports(content) {
  const imported = new Set();
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const clause = match[1].trim();
    if (!clause) {
      continue;
    }

    const namespaceMatch = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (namespaceMatch) {
      imported.add(namespaceMatch[1]);
      continue;
    }

    const parts = clause.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const items = trimmed.slice(1, -1).split(',');
        for (const item of items) {
          const cleaned = item.trim();
          if (!cleaned) {
            continue;
          }
          const aliasMatch = cleaned.match(/^(?:([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*))$/);
          if (aliasMatch) {
            imported.add(aliasMatch[1] || aliasMatch[3]);
          }
          }
      } else {
        const defaultMatch = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
        if (defaultMatch) {
          imported.add(defaultMatch[1]);
        }
      }
    }
  }

  return imported;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const antiPatterns = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\/\//.test(line)) {
      continue;
    }

    for (const check of antiPatternChecks) {
      if (check.regex.test(line)) {
        antiPatterns.push({
          file: toRelative(filePath),
          line: index + 1,
          category: check.label,
          snippet: line.trim(),
        });
      }
    }
  }

  return {
    antiPatterns,
    exports: collectExports(content),
    imports: collectImports(content),
    lineCount: lines.length,
  };
}

function buildMarkdown(reportDate, antiPatterns, unusedExports, largeFiles) {
  const lines = [`# Quality GC Report`, ``, `Date: ${reportDate}`, ``];

  lines.push(`## Anti-patterns`);
  lines.push(``);
  lines.push(`| File | Line | Category | Snippet |`);
  lines.push(`| --- | ---: | --- | --- |`);
  if (antiPatterns.length === 0) {
    lines.push(`| None | - | - | - |`);
  } else {
    for (const item of antiPatterns) {
      lines.push(
        `| ${escapeCell(item.file)} | ${item.line} | ${escapeCell(item.category)} | ${escapeCell(item.snippet)} |`
      );
    }
  }
  lines.push(``);

  lines.push(`## Unused Exports`);
  lines.push(``);
  if (unusedExports.length === 0) {
    lines.push(`- None`);
  } else {
    for (const item of unusedExports) {
      lines.push(`- \`${item.name}\` in \`${item.file}\``);
    }
  }
  lines.push(``);

  lines.push(`## Large Files`);
  lines.push(``);
  if (largeFiles.length === 0) {
    lines.push(`- None`);
  } else {
    for (const item of largeFiles) {
      lines.push(`- \`${item.file}\` (${item.lineCount} lines)`);
    }
  }
  lines.push(``);

  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`- Anti-patterns: ${antiPatterns.length}`);
  lines.push(`- Unused exports: ${unusedExports.length}`);
  lines.push(`- Large files: ${largeFiles.length}`);

  return `${lines.join('\n')}\n`;
}

function main() {
  const files = fs.existsSync(srcDir) ? walk(srcDir, []) : [];
  const antiPatterns = [];
  const exportsByFile = [];
  const importedNames = new Set();
  const largeFiles = [];

  for (const filePath of files) {
    const result = scanFile(filePath);
    antiPatterns.push(...result.antiPatterns);
    exportsByFile.push({
      file: toRelative(filePath),
      exports: result.exports,
    });
    for (const importedName of result.imports) {
      importedNames.add(importedName);
    }
    if (result.lineCount >= 300) {
      largeFiles.push({
        file: toRelative(filePath),
        lineCount: result.lineCount,
      });
    }
  }

  const unusedExports = [];
  for (const entry of exportsByFile) {
    for (const exportName of entry.exports) {
      if (!importedNames.has(exportName)) {
        unusedExports.push({
          file: entry.file,
          name: exportName,
        });
      }
    }
  }

  const report = buildMarkdown(new Date().toISOString(), antiPatterns, unusedExports, largeFiles);
  process.stdout.write(report);
}

main();
