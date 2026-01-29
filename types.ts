
export enum IssueType {
  VULNERABILITY = 'VULNERABILITY',
  OUTDATED = 'OUTDATED',
  DEPRECATED = 'DEPRECATED',
  HEALTHY = 'HEALTHY'
}

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO'
}

export interface PackageAnalysis {
  name: string;
  currentVersion: string;
  suggestedVersion: string;
  issueType: IssueType;
  severity: Severity;
  description: string;
  remediation: string;
  links?: string[];
}

export interface DependencyNode {
  name: string;
  attributes?: {
    version?: string;
    status?: string;
    severity?: string;
  };
  children?: DependencyNode[];
}

export interface AuditReport {
  summary: {
    totalPackages: number;
    vulnerabilities: number;
    outdated: number;
    deprecated: number;
    healthScore: number;
  };
  details: PackageAnalysis[];
  dependencyTree: DependencyNode;
  generalAdvice: string;
}

export interface GithubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
}
