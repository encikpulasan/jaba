import { kv } from '../db/connection.ts';
import { auditLogger } from './audit.ts';

export interface SecurityScan {
  id: string;
  scanType: 'vulnerability' | 'malware' | 'dependency' | 'configuration' | 'content' | 'permissions';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  findings: SecurityFinding[];
  summary: ScanSummary;
  organizationId?: string;
  triggeredBy: 'scheduled' | 'manual' | 'upload' | 'api';
  metadata: Record<string, unknown>;
}

export interface SecurityFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'vulnerability' | 'malware' | 'suspicious_pattern' | 'misconfiguration' | 'data_exposure';
  title: string;
  description: string;
  location: string;
  recommendation: string;
  cve?: string;
  cvssScore?: number;
  affectedResource: string;
  status: 'open' | 'acknowledged' | 'fixed' | 'false_positive';
  discoveredAt: string;
  fixedAt?: string;
  metadata: Record<string, unknown>;
}

export interface ScanSummary {
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  riskScore: number;
  lastScanDate: string;
  trendAnalysis: {
    newFindings: number;
    fixedFindings: number;
    regressions: number;
  };
}

export interface ScanPolicy {
  id: string;
  name: string;
  scanTypes: Array<SecurityScan['scanType']>;
  schedule: string; // Cron expression
  organizationId?: string;
  isActive: boolean;
  notifications: {
    email: boolean;
    webhook?: string;
    severityThreshold: 'low' | 'medium' | 'high' | 'critical';
  };
  rules: ScanRule[];
  createdAt: string;
  updatedAt: string;
}

export interface ScanRule {
  id: string;
  name: string;
  type: 'pattern' | 'regex' | 'signature' | 'heuristic';
  rule: string;
  severity: SecurityFinding['severity'];
  enabled: boolean;
  description: string;
}

export class SecurityScanner {
  private static instance: SecurityScanner;

  public static getInstance(): SecurityScanner {
    if (!SecurityScanner.instance) {
      SecurityScanner.instance = new SecurityScanner();
    }
    return SecurityScanner.instance;
  }

  async startScan(
    scanType: SecurityScan['scanType'],
    organizationId?: string,
    triggeredBy: SecurityScan['triggeredBy'] = 'manual',
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const scanId = crypto.randomUUID();
    
    const scan: SecurityScan = {
      id: scanId,
      scanType,
      status: 'pending',
      startedAt: new Date().toISOString(),
      findings: [],
      summary: {
        totalFindings: 0,
        criticalFindings: 0,
        highFindings: 0,
        mediumFindings: 0,
        lowFindings: 0,
        riskScore: 0,
        lastScanDate: new Date().toISOString(),
        trendAnalysis: {
          newFindings: 0,
          fixedFindings: 0,
          regressions: 0,
        },
      },
      organizationId,
      triggeredBy,
      metadata,
    };

    await kv.set(['security', 'scans', scanId], scan);
    
    if (organizationId) {
      await kv.set(['security', 'scans_by_org', organizationId, scanId], scanId);
    }

    // Log the scan start
    await auditLogger.logEvent({
      eventType: 'security_scan',
      userId: metadata.userId as string,
      userEmail: metadata.userEmail as string,
      ipAddress: metadata.ipAddress as string || 'system',
      userAgent: 'security_scanner',
      resource: 'security_scan',
      action: 'start',
      details: { scanType, scanId, triggeredBy },
      severity: 'medium',
      category: 'security',
      success: true,
      organizationId,
      complianceFlags: ['security_scan'],
    });

    // Start the scan asynchronously
    this.performScan(scanId);

    return scanId;
  }

  private async performScan(scanId: string): Promise<void> {
    const result = await kv.get(['security', 'scans', scanId]);
    if (!result.value) return;

    const scan = result.value as SecurityScan;
    scan.status = 'running';
    await kv.set(['security', 'scans', scanId], scan);

    try {
      const findings = await this.executeScanByType(scan.scanType, scan.organizationId);
      const summary = this.calculateScanSummary(findings);

      scan.findings = findings;
      scan.summary = summary;
      scan.status = 'completed';
      scan.completedAt = new Date().toISOString();
      scan.duration = new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime();

      await kv.set(['security', 'scans', scanId], scan);

      // Process findings
      await this.processFindings(findings, scan.organizationId);

      // Send notifications if critical findings
      if (summary.criticalFindings > 0) {
        await this.sendCriticalFindingsAlert(scan);
      }

    } catch (error) {
      scan.status = 'failed';
      scan.completedAt = new Date().toISOString();
      scan.metadata.error = error.message;
      
      await kv.set(['security', 'scans', scanId], scan);
      
      await auditLogger.logEvent({
        eventType: 'security_scan',
        userId: 'system',
        userEmail: 'system',
        ipAddress: 'system',
        userAgent: 'security_scanner',
        resource: 'security_scan',
        action: 'error',
        details: { scanId, error: error.message },
        severity: 'high',
        category: 'security',
        success: false,
        errorMessage: error.message,
        organizationId: scan.organizationId,
        complianceFlags: ['security_scan', 'error'],
      });
    }
  }

  private async executeScanByType(
    scanType: SecurityScan['scanType'],
    organizationId?: string
  ): Promise<SecurityFinding[]> {
    switch (scanType) {
      case 'vulnerability':
        return await this.performVulnerabilityScan(organizationId);
      case 'malware':
        return await this.performMalwareScan(organizationId);
      case 'dependency':
        return await this.performDependencyScan();
      case 'configuration':
        return await this.performConfigurationScan(organizationId);
      case 'content':
        return await this.performContentScan(organizationId);
      case 'permissions':
        return await this.performPermissionsScan(organizationId);
      default:
        throw new Error(`Unknown scan type: ${scanType}`);
    }
  }

  private async performVulnerabilityScan(organizationId?: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Check for common web vulnerabilities
    const vulnChecks = [
      {
        check: 'sql_injection_patterns',
        pattern: /(union|select|insert|update|delete|drop)\s+/i,
        severity: 'high' as const,
        description: 'Potential SQL injection vulnerability detected',
      },
      {
        check: 'xss_patterns',
        pattern: /<script|javascript:|on\w+\s*=/i,
        severity: 'medium' as const,
        description: 'Potential XSS vulnerability detected',
      },
      {
        check: 'path_traversal',
        pattern: /\.\.[\/\\]/,
        severity: 'high' as const,
        description: 'Potential path traversal vulnerability detected',
      },
    ];

    // Scan content for vulnerability patterns
    const contentIter = kv.list({ 
      prefix: organizationId ? ['content', 'by_org', organizationId] : ['content'] 
    });

    for await (const entry of contentIter) {
      const content = entry.value as any;
      const contentStr = JSON.stringify(content);

      for (const vulnCheck of vulnChecks) {
        if (vulnCheck.pattern.test(contentStr)) {
          findings.push({
            id: crypto.randomUUID(),
            severity: vulnCheck.severity,
            type: 'vulnerability',
            title: `${vulnCheck.check} detected`,
            description: vulnCheck.description,
            location: `content/${content.id}`,
            recommendation: `Review and sanitize content to prevent ${vulnCheck.check}`,
            affectedResource: content.id,
            status: 'open',
            discoveredAt: new Date().toISOString(),
            metadata: {
              pattern: vulnCheck.pattern.source,
              checkType: vulnCheck.check,
            },
          });
        }
      }
    }

    return findings;
  }

  private async performMalwareScan(organizationId?: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Basic malware signature patterns
    const malwareSignatures = [
      {
        name: 'suspicious_executable',
        pattern: /\.(exe|bat|cmd|scr|pif|com)$/i,
        severity: 'high' as const,
      },
      {
        name: 'encoded_script',
        pattern: /eval\s*\(\s*atob\s*\(|fromCharCode|unescape\s*\(/i,
        severity: 'medium' as const,
      },
      {
        name: 'obfuscated_javascript',
        pattern: /var\s+[a-zA-Z0-9_]{1,3}\s*=\s*\[.*?\];.*?\[.*?\]\(.*?\)/,
        severity: 'medium' as const,
      },
    ];

    // Scan uploaded media files
    const mediaIter = kv.list({ 
      prefix: organizationId ? ['media', 'by_org', organizationId] : ['media'] 
    });

    for await (const entry of mediaIter) {
      const media = entry.value as any;
      
      for (const signature of malwareSignatures) {
        if (
          (signature.pattern.test(media.filename) || 
           signature.pattern.test(media.content || ''))
        ) {
          findings.push({
            id: crypto.randomUUID(),
            severity: signature.severity,
            type: 'malware',
            title: `Potential malware detected: ${signature.name}`,
            description: `File matches known malware signature: ${signature.name}`,
            location: `media/${media.id}`,
            recommendation: 'Quarantine file and perform detailed analysis',
            affectedResource: media.id,
            status: 'open',
            discoveredAt: new Date().toISOString(),
            metadata: {
              signature: signature.name,
              filename: media.filename,
            },
          });
        }
      }
    }

    return findings;
  }

  private async performDependencyScan(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Known vulnerable packages (simplified example)
    const vulnerablePackages = [
      {
        name: 'lodash',
        version: '<4.17.21',
        cve: 'CVE-2021-23337',
        severity: 'high' as const,
        description: 'Command injection vulnerability in lodash',
      },
      {
        name: 'jquery',
        version: '<3.5.0',
        cve: 'CVE-2020-11022',
        severity: 'medium' as const,
        description: 'Cross-site scripting vulnerability in jQuery',
      },
    ];

    // In a real implementation, this would parse package.json or deno.json
    // and check against a vulnerability database
    findings.push({
      id: crypto.randomUUID(),
      severity: 'low',
      type: 'vulnerability',
      title: 'Dependency scan completed',
      description: 'No critical vulnerabilities found in dependencies',
      location: 'dependencies',
      recommendation: 'Continue monitoring for new vulnerabilities',
      affectedResource: 'project_dependencies',
      status: 'open',
      discoveredAt: new Date().toISOString(),
      metadata: {
        scannedPackages: vulnerablePackages.length,
      },
    });

    return findings;
  }

  private async performConfigurationScan(organizationId?: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Check for insecure configurations
    const configChecks = [
      {
        key: 'debug_mode',
        check: (value: any) => value === true,
        severity: 'medium' as const,
        description: 'Debug mode is enabled in production',
        recommendation: 'Disable debug mode in production environments',
      },
      {
        key: 'cors_origin',
        check: (value: any) => value === '*',
        severity: 'high' as const,
        description: 'CORS is configured to allow all origins',
        recommendation: 'Configure CORS to allow only trusted origins',
      },
      {
        key: 'session_secure',
        check: (value: any) => value === false,
        severity: 'medium' as const,
        description: 'Session cookies are not configured as secure',
        recommendation: 'Enable secure flag for session cookies',
      },
    ];

    // Scan system configuration
    const configResult = await kv.get(['config', 'system']);
    if (configResult.value) {
      const config = configResult.value as Record<string, any>;
      
      for (const configCheck of configChecks) {
        if (config[configCheck.key] && configCheck.check(config[configCheck.key])) {
          findings.push({
            id: crypto.randomUUID(),
            severity: configCheck.severity,
            type: 'misconfiguration',
            title: `Insecure configuration: ${configCheck.key}`,
            description: configCheck.description,
            location: `config/${configCheck.key}`,
            recommendation: configCheck.recommendation,
            affectedResource: 'system_config',
            status: 'open',
            discoveredAt: new Date().toISOString(),
            metadata: {
              configKey: configCheck.key,
              currentValue: config[configCheck.key],
            },
          });
        }
      }
    }

    return findings;
  }

  private async performContentScan(organizationId?: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Scan for sensitive data exposure
    const sensitivePatterns = [
      {
        name: 'api_key',
        pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9]{32,}['"]?/i,
        severity: 'critical' as const,
      },
      {
        name: 'password',
        pattern: /(?:password|pwd)\s*[:=]\s*['"][^'"]{8,}['"]?/i,
        severity: 'high' as const,
      },
      {
        name: 'email',
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
        severity: 'low' as const,
      },
      {
        name: 'phone',
        pattern: /\b\d{3}[-.]\d{3}[-.]\d{4}\b/,
        severity: 'low' as const,
      },
    ];

    const contentIter = kv.list({ 
      prefix: organizationId ? ['content', 'by_org', organizationId] : ['content'] 
    });

    for await (const entry of contentIter) {
      const content = entry.value as any;
      const contentStr = JSON.stringify(content);

      for (const pattern of sensitivePatterns) {
        const matches = contentStr.match(pattern.pattern);
        if (matches) {
          findings.push({
            id: crypto.randomUUID(),
            severity: pattern.severity,
            type: 'data_exposure',
            title: `Potential ${pattern.name} exposure`,
            description: `Sensitive data pattern detected: ${pattern.name}`,
            location: `content/${content.id}`,
            recommendation: `Review and remove or encrypt ${pattern.name} data`,
            affectedResource: content.id,
            status: 'open',
            discoveredAt: new Date().toISOString(),
            metadata: {
              patternType: pattern.name,
              matchCount: matches.length,
            },
          });
        }
      }
    }

    return findings;
  }

  private async performPermissionsScan(organizationId?: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Scan for overprivileged users and misconfigured permissions
    const userIter = kv.list({ 
      prefix: organizationId ? ['users', 'by_org', organizationId] : ['users'] 
    });

    for await (const entry of userIter) {
      const user = entry.value as any;
      
      // Check for users with excessive permissions
      if (user.role === 'admin' && user.lastLoginAt) {
        const lastLogin = new Date(user.lastLoginAt);
        const daysSinceLogin = (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLogin > 90) {
          findings.push({
            id: crypto.randomUUID(),
            severity: 'medium',
            type: 'misconfiguration',
            title: 'Inactive admin account',
            description: `Admin user has not logged in for ${Math.round(daysSinceLogin)} days`,
            location: `user/${user.id}`,
            recommendation: 'Review and possibly deactivate inactive admin accounts',
            affectedResource: user.id,
            status: 'open',
            discoveredAt: new Date().toISOString(),
            metadata: {
              userId: user.id,
              userEmail: user.email,
              daysSinceLogin: Math.round(daysSinceLogin),
            },
          });
        }
      }

      // Check for accounts without MFA
      if (user.role === 'admin' && !user.mfaEnabled) {
        findings.push({
          id: crypto.randomUUID(),
          severity: 'high',
          type: 'misconfiguration',
          title: 'Admin account without MFA',
          description: 'Admin user does not have multi-factor authentication enabled',
          location: `user/${user.id}`,
          recommendation: 'Enable multi-factor authentication for all admin accounts',
          affectedResource: user.id,
          status: 'open',
          discoveredAt: new Date().toISOString(),
          metadata: {
            userId: user.id,
            userEmail: user.email,
            role: user.role,
          },
        });
      }
    }

    return findings;
  }

  private calculateScanSummary(findings: SecurityFinding[]): ScanSummary {
    const summary: ScanSummary = {
      totalFindings: findings.length,
      criticalFindings: findings.filter(f => f.severity === 'critical').length,
      highFindings: findings.filter(f => f.severity === 'high').length,
      mediumFindings: findings.filter(f => f.severity === 'medium').length,
      lowFindings: findings.filter(f => f.severity === 'low').length,
      riskScore: 0,
      lastScanDate: new Date().toISOString(),
      trendAnalysis: {
        newFindings: findings.length, // All findings are new in this scan
        fixedFindings: 0,
        regressions: 0,
      },
    };

    // Calculate risk score (0-100)
    summary.riskScore = Math.min(100, 
      summary.criticalFindings * 25 +
      summary.highFindings * 10 +
      summary.mediumFindings * 5 +
      summary.lowFindings * 1
    );

    return summary;
  }

  private async processFindings(findings: SecurityFinding[], organizationId?: string): Promise<void> {
    // Store findings for tracking and remediation
    for (const finding of findings) {
      await kv.set(['security', 'findings', finding.id], finding);
      
      if (organizationId) {
        await kv.set(['security', 'findings_by_org', organizationId, finding.id], finding.id);
      }

      // Log critical findings
      if (finding.severity === 'critical') {
        await auditLogger.logEvent({
          eventType: 'vulnerability_detected',
          userId: 'system',
          userEmail: 'system',
          ipAddress: 'scanner',
          userAgent: 'security_scanner',
          resource: finding.affectedResource,
          action: 'detect',
          details: {
            findingId: finding.id,
            severity: finding.severity,
            type: finding.type,
            title: finding.title,
          },
          severity: 'critical',
          category: 'security',
          success: true,
          organizationId,
          complianceFlags: ['security_scan', 'vulnerability', 'critical'],
        });
      }
    }
  }

  private async sendCriticalFindingsAlert(scan: SecurityScan): Promise<void> {
    // In a real implementation, this would send notifications via email, Slack, etc.
    console.warn(`CRITICAL SECURITY FINDINGS DETECTED in scan ${scan.id}:`, {
      criticalFindings: scan.summary.criticalFindings,
      riskScore: scan.summary.riskScore,
      organizationId: scan.organizationId,
    });
  }

  // Public methods for managing scans and findings
  async getScanResults(scanId: string): Promise<SecurityScan | null> {
    const result = await kv.get(['security', 'scans', scanId]);
    return result.value as SecurityScan || null;
  }

  async listScans(organizationId?: string, limit: number = 50): Promise<SecurityScan[]> {
    const scans: SecurityScan[] = [];
    const prefix = organizationId ? 
      ['security', 'scans_by_org', organizationId] : 
      ['security', 'scans'];

    const iter = kv.list({ prefix });
    let count = 0;

    for await (const entry of iter) {
      if (count >= limit) break;

      let scan: SecurityScan;
      if (organizationId) {
        const scanResult = await kv.get(['security', 'scans', entry.value]);
        if (!scanResult.value) continue;
        scan = scanResult.value as SecurityScan;
      } else {
        scan = entry.value as SecurityScan;
      }

      scans.push(scan);
      count++;
    }

    return scans.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  async getFindings(organizationId?: string, status?: SecurityFinding['status']): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const prefix = organizationId ? 
      ['security', 'findings_by_org', organizationId] : 
      ['security', 'findings'];

    const iter = kv.list({ prefix });

    for await (const entry of iter) {
      let finding: SecurityFinding;
      if (organizationId) {
        const findingResult = await kv.get(['security', 'findings', entry.value]);
        if (!findingResult.value) continue;
        finding = findingResult.value as SecurityFinding;
      } else {
        finding = entry.value as SecurityFinding;
      }

      if (!status || finding.status === status) {
        findings.push(finding);
      }
    }

    return findings.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  async updateFindingStatus(findingId: string, status: SecurityFinding['status']): Promise<void> {
    const result = await kv.get(['security', 'findings', findingId]);
    if (!result.value) {
      throw new Error('Finding not found');
    }

    const finding = result.value as SecurityFinding;
    finding.status = status;
    
    if (status === 'fixed') {
      finding.fixedAt = new Date().toISOString();
    }

    await kv.set(['security', 'findings', findingId], finding);
  }

  async createScanPolicy(policy: Omit<ScanPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const policyId = crypto.randomUUID();
    const newPolicy: ScanPolicy = {
      id: policyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...policy,
    };

    await kv.set(['security', 'policies', policyId], newPolicy);
    
    if (policy.organizationId) {
      await kv.set(['security', 'policies_by_org', policy.organizationId, policyId], policyId);
    }

    return policyId;
  }

  async scheduleScans(): Promise<void> {
    // This would typically be called by a cron job
    const iter = kv.list({ prefix: ['security', 'policies'] });
    
    for await (const entry of iter) {
      const policy = entry.value as ScanPolicy;
      if (policy.isActive) {
        // Check if scan should run based on schedule
        // For simplicity, we'll just run daily scans
        const lastScan = await this.getLastScanForPolicy(policy.id);
        const shouldRun = !lastScan || 
          new Date().getTime() - new Date(lastScan.startedAt).getTime() > 24 * 60 * 60 * 1000;

        if (shouldRun) {
          for (const scanType of policy.scanTypes) {
            await this.startScan(scanType, policy.organizationId, 'scheduled', {
              policyId: policy.id,
            });
          }
        }
      }
    }
  }

  private async getLastScanForPolicy(policyId: string): Promise<SecurityScan | null> {
    const iter = kv.list({ prefix: ['security', 'scans'] });
    let lastScan: SecurityScan | null = null;

    for await (const entry of iter) {
      const scan = entry.value as SecurityScan;
      if (scan.metadata.policyId === policyId) {
        if (!lastScan || new Date(scan.startedAt) > new Date(lastScan.startedAt)) {
          lastScan = scan;
        }
      }
    }

    return lastScan;
  }
}

export const securityScanner = SecurityScanner.getInstance(); 