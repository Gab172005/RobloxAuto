import fs from 'node:fs';
import path from 'node:path';
import type { SecurityFinding, SecurityScanResult } from '../types.js';

interface PatternRule {
  category: SecurityFinding['category'];
  severity: SecurityFinding['severity'];
  title: string;
  regex: RegExp;
  remediation: string;
}

const LUAU_SECURITY_RULES: PatternRule[] = [
  {
    category: 'backdoor',
    severity: 'CRITICAL',
    title: 'Dynamic numeric asset require() backdoor vector',
    regex: /\brequire\s*\(\s*\d{4,}\s*\)/,
    remediation: 'Remove require(<assetId>) immediately. Only require vetted local ModuleScripts inside ReplicatedStorage or ServerScriptService.',
  },
  {
    category: 'backdoor',
    severity: 'CRITICAL',
    title: 'Environment hijacking via getfenv/setfenv',
    regex: /\b(getfenv|setfenv)\s*\(/,
    remediation: 'Remove getfenv/setfenv calls. Legitimate strict Luau gameplay never requires dynamic environment mutation.',
  },
  {
    category: 'backdoor',
    severity: 'CRITICAL',
    title: 'Dynamic code execution via loadstring()',
    regex: /\bloadstring\s*\(/,
    remediation: 'Remove loadstring() and ensure ServerScriptService.LoadStringEnabled remains false.',
  },
  {
    category: 'backdoor',
    severity: 'CRITICAL',
    title: 'Obfuscated string.char() byte payload detected',
    regex: /string\.char\s*\(\s*\d+(?:\s*,\s*\d+){5,}\s*\)/,
    remediation: 'Inspect and delete obfuscated script payload; replace with transparent source code.',
  },
  {
    category: 'backdoor',
    severity: 'HIGH',
    title: 'Hex-escaped obfuscated string payload',
    regex: /(?:\\x[0-9a-fA-F]{2}){6,}|(?:\\\d{2,3}){8,}/,
    remediation: 'Remove obfuscated byte escapes and replace with readable Luau.',
  },
  {
    category: 'backdoor',
    severity: 'HIGH',
    title: 'Dynamic InsertService:LoadAsset() call',
    regex: /InsertService\s*:\s*LoadAsset\s*\(/,
    remediation: 'Avoid runtime InsertService:LoadAsset on unvetted IDs; pre-sanitize models into workspace assets.',
  },
  {
    category: 'http_exfiltration',
    severity: 'HIGH',
    title: 'Direct HttpService external request found',
    regex: /HttpService\s*:\s*(GetAsync|PostAsync|RequestAsync)\s*\(/,
    remediation: 'Verify external endpoints against docs/contracts.json and strip unauthorized Discord webhooks or exfiltration beacons.',
  },
  {
    category: 'remote_exploit',
    severity: 'HIGH',
    title: 'Server invokes client via RemoteFunction:InvokeClient',
    regex: /:\s*InvokeClient\s*\(/,
    remediation: 'Never call InvokeClient from the server; malicious clients can hang server threads indefinitely. Use FireClient instead.',
  },
];

const RBXMX_EMBEDDED_SCRIPT_REGEX = /<Item\s+class="(Script|LocalScript|ModuleScript)"/g;

export function scanLuauSource(filePath: string, source: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = source.split(/\r?\n/);
  let counter = 1;

  // Check for --!strict header in .luau files
  const firstNonEmpty = lines.find((l) => l.trim().length > 0)?.trim() || '';
  if (filePath.endsWith('.luau') && !firstNonEmpty.startsWith('--!strict')) {
    findings.push({
      id: `SEC-${counter++}`,
      severity: 'LOW',
      category: 'strict_mode',
      file: filePath,
      line: 1,
      title: 'Missing --!strict directive at top of Luau file',
      snippet: firstNonEmpty.slice(0, 100),
      remediation: 'Add `--!strict` as line 1 of every Luau script to catch type bugs before playtest.',
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();
    // Skip pure single-line comments unless checking obfuscated long comment traps
    if (trimmed.startsWith('--') && !trimmed.includes('require(') && !trimmed.includes('getfenv')) {
      continue;
    }

    for (const rule of LUAU_SECURITY_RULES) {
      if (rule.regex.test(lineText)) {
        findings.push({
          id: `SEC-${counter++}`,
          severity: rule.severity,
          category: rule.category,
          file: filePath,
          line: i + 1,
          title: rule.title,
          snippet: trimmed.slice(0, 140),
          remediation: rule.remediation,
        });
      }
    }

    // Heuristic: Client-trusted currency / reward amount directly added inside OnServerEvent
    if (
      /OnServerEvent\s*:\s*Connect\s*\(\s*function\s*\(\s*player\s*,\s*(amount|coins|cash|gems|money|reward|price)\b/i.test(
        lineText
      )
    ) {
      findings.push({
        id: `SEC-${counter++}`,
        severity: 'CRITICAL',
        category: 'remote_exploit',
        file: filePath,
        line: i + 1,
        title: 'Potential client-trusted currency/price parameter in OnServerEvent',
        snippet: trimmed.slice(0, 140),
        remediation: 'Pass an item/action ID from the client and look up authoritative prices/rewards on the server.',
      });
    }
  }

  // Check ProcessReceipt idempotency if file defines ProcessReceipt
  if (/MarketplaceService\.ProcessReceipt\s*=/.test(source)) {
    const hasPurchaseIdCheck = /PurchaseId/.test(source);
    const hasNotProcessed = /NotProcessedYet/.test(source);
    if (!hasPurchaseIdCheck || !hasNotProcessed) {
      findings.push({
        id: `SEC-${counter++}`,
        severity: 'CRITICAL',
        category: 'process_receipt',
        file: filePath,
        line: 1,
        title: 'MarketplaceService.ProcessReceipt lacks PurchaseId idempotency or NotProcessedYet handling',
        snippet: 'MarketplaceService.ProcessReceipt = ...',
        remediation:
          'Persist receiptInfo.PurchaseId before returning PurchaseGranted and return Enum.ProductPurchaseDecision.NotProcessedYet on load/save failure.',
      });
    }
  }

  return findings;
}

/**
 * Inspects Roblox XML model files (.rbxmx / .rbxlx) for embedded scripts (Creator Store backdoor vector).
 */
export function scanRbxmxModel(filePath: string, xmlContent: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  let match: RegExpExecArray | null;
  let idx = 1;
  RBXMX_EMBEDDED_SCRIPT_REGEX.lastIndex = 0;

  while ((match = RBXMX_EMBEDDED_SCRIPT_REGEX.exec(xmlContent)) !== null) {
    const scriptClass = match[1];
    const lineNum = xmlContent.slice(0, match.index).split(/\r?\n/).length;
    findings.push({
      id: `ASSET-${idx++}`,
      severity: 'CRITICAL',
      category: 'embedded_script',
      file: filePath,
      line: lineNum,
      title: `Unauthorized embedded ${scriptClass} inside imported Roblox model`,
      snippet: match[0],
      remediation: `Strip embedded ${scriptClass} instances from imported Creator Store models via Librarian sanitizer before keeping in workspace.`,
    });
  }

  // Also scan any embedded ProtectedString Luau code inside the XML
  const sourceBlocks = xmlContent.matchAll(/<ProtectedString name="Source"><!\[CDATA\[([\s\S]*?)\]\]><\/ProtectedString>/g);
  for (const block of sourceBlocks) {
    const innerFindings = scanLuauSource(filePath, block[1]);
    for (const f of innerFindings) {
      if (f.severity === 'CRITICAL' || f.severity === 'HIGH') {
        findings.push(f);
      }
    }
  }

  return findings;
}

/**
 * Strips all unauthorized Script, LocalScript, and ModuleScript XML blocks from an imported .rbxmx model.
 */
export function sanitizeRbxmxXml(xmlContent: string): { sanitizedXml: string; strippedCount: number } {
  let strippedCount = 0;
  // Iteratively strip leaf or nested Item blocks for Script/LocalScript/ModuleScript
  const scriptBlockPattern = /<Item\s+class="(?:Script|LocalScript|ModuleScript)"[^>]*>[\s\S]*?<\/Item>/g;
  const sanitizedXml = xmlContent.replace(scriptBlockPattern, () => {
    strippedCount += 1;
    return '<!-- RoForge Librarian Sanitizer: Stripped unauthorized script -->';
  });
  return { sanitizedXml, strippedCount };
}

/**
 * Recursively scans an entire project workspace (Luau scripts + imported .rbxmx assets)
 * and checks cross-file invariants (e.g., multiple ProcessReceipt assignments).
 */
export function scanWorkspaceSecurity(workspacePath: string): SecurityScanResult {
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;
  const processReceiptFiles: string[] = [];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const rel = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
        if (entry.name.endsWith('.luau') || entry.name.endsWith('.lua')) {
          scannedFiles++;
          const src = fs.readFileSync(fullPath, 'utf8');
          if (/MarketplaceService\.ProcessReceipt\s*=/.test(src)) {
            processReceiptFiles.push(rel);
          }
          findings.push(...scanLuauSource(rel, src));
        } else if (entry.name.endsWith('.rbxmx') || entry.name.endsWith('.rbxlx')) {
          scannedFiles++;
          const xml = fs.readFileSync(fullPath, 'utf8');
          findings.push(...scanRbxmxModel(rel, xml));
        }
      }
    }
  };

  walk(workspacePath);

  if (processReceiptFiles.length > 1) {
    findings.push({
      id: `SEC-MULTI-RECEIPT`,
      severity: 'CRITICAL',
      category: 'process_receipt',
      file: processReceiptFiles.join(', '),
      line: 1,
      title: 'Multiple scripts assign MarketplaceService.ProcessReceipt',
      snippet: processReceiptFiles.join(', '),
      remediation: 'Consolidate all Developer Product receipt handling into a single MarketplaceService.ProcessReceipt handler in MonetizationServer.server.luau.',
    });
  }

  // Re-number findings cleanly
  const normalized = findings.map((f, idx) => ({
    ...f,
    id: `SCAN-${String(idx + 1).padStart(3, '0')}`,
  }));

  const criticalCount = normalized.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = normalized.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = normalized.filter((f) => f.severity === 'MEDIUM').length;
  const lowCount = normalized.filter((f) => f.severity === 'LOW').length;

  return {
    scannedFiles,
    clean: criticalCount === 0 && highCount === 0,
    releaseBlocked: criticalCount > 0 || highCount > 0,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    findings: normalized,
  };
}

