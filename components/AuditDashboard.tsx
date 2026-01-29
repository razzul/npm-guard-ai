
import React, { useState, useMemo } from 'react';
import { AuditReport, IssueType, Severity, PackageAnalysis, DependencyNode } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import Tree from 'react-d3-tree';
import Badge from './ui/Badge';

interface Props {
  report: AuditReport;
  onReset: () => void;
}

const AuditDashboard: React.FC<Props> = ({ report, onReset }) => {
  const { summary, details, generalAdvice, dependencyTree } = report;
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const [activeView, setActiveView] = useState<'table' | 'tree' | 'cicd'>('table');
  const [copied, setCopied] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const toggleRow = (index: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(index)) {
      newExpandedRows.delete(index);
    } else {
      newExpandedRows.add(index);
    }
    setExpandedRows(newExpandedRows);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportToJson = () => {
    const jsonContent = JSON.stringify(report, null, 2);
    downloadFile(jsonContent, `npm-audit-report-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    setShowExportMenu(false);
  };

  const exportToCsv = () => {
    const headers = ['Package Name', 'Current Version', 'Suggested Version', 'Issue Type', 'Severity', 'Description', 'Remediation'];
    const rows = details.map(pkg => [
      pkg.name,
      pkg.currentVersion,
      pkg.suggestedVersion,
      pkg.issueType,
      pkg.severity,
      `"${pkg.description.replace(/"/g, '""')}"`,
      `"${pkg.remediation.replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    downloadFile(csvContent, `npm-audit-report-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    setShowExportMenu(false);
  };

  const filteredDetails = useMemo(() => {
    if (severityFilter === 'ALL') return details;
    return details.filter(item => item.severity === severityFilter);
  }, [details, severityFilter]);

  const chartData = [
    { name: 'Vulnerabilities', value: summary.vulnerabilities, color: '#ef4444' },
    { name: 'Outdated', value: summary.outdated, color: '#f59e0b' },
    { name: 'Deprecated', value: summary.deprecated, color: '#6366f1' },
    { name: 'Healthy', value: Math.max(0, summary.totalPackages - (summary.vulnerabilities + summary.outdated + summary.deprecated)), color: '#10b981' }
  ].filter(d => d.value > 0);

  const githubActionYaml = `name: NPM Guard AI Audit
on:
  pull_request:
    paths:
      - 'package.json'
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run NPM Guard Audit
        uses: npm-guard-ai/github-action@v1
        with:
          gemini-api-key: \${{ secrets.GEMINI_API_KEY }}
          fail-on-severity: 'high'`;

  const gitlabCiYaml = `npm-guard-audit:
  image: node:latest
  stage: test
  only:
    changes:
      - package.json
  script:
    - npx npm-guard-ai-cli audit --key $GEMINI_API_KEY --fail-high
  variables:
    GEMINI_API_KEY: $GEMINI_API_KEY`;

  const getSeverityVariant = (sev: Severity) => {
    switch (sev) {
      case Severity.CRITICAL: return 'danger';
      case Severity.HIGH: return 'danger';
      case Severity.MEDIUM: return 'warning';
      case Severity.LOW: return 'info';
      default: return 'slate';
    }
  };

  const getIssueTypeVariant = (type: string | undefined) => {
    switch (type) {
      case IssueType.VULNERABILITY: return 'danger';
      case IssueType.DEPRECATED: return 'warning';
      case IssueType.OUTDATED: return 'info';
      case IssueType.HEALTHY: return 'success';
      default: return 'slate';
    }
  };

  const renderNodeWithCustomEvents = ({ nodeDatum, toggleNode }: { nodeDatum: any, toggleNode: any }) => {
    const status = nodeDatum.attributes?.status;
    const hasChildren = nodeDatum.children && nodeDatum.children.length > 0;
    
    let color = '#94a3b8'; 
    let icon = '📦';
    let pulseClass = '';

    if (status === IssueType.VULNERABILITY) { 
      color = '#ef4444'; 
      icon = '⚠️'; 
      pulseClass = 'node-vulnerability';
    } else if (status === IssueType.OUTDATED) { 
      color = '#f59e0b'; 
      icon = '⬆️'; 
      pulseClass = 'node-outdated';
    } else if (status === IssueType.DEPRECATED) { 
      color = '#6366f1'; 
      icon = '🚫'; 
    } else if (status === IssueType.HEALTHY) { 
      color = '#10b981'; 
      icon = '✅'; 
    }

    return (
      <g>
        <circle 
          r="24" 
          fill={color} 
          stroke="#fff" 
          strokeWidth="3" 
          className={`cursor-pointer transition-all hover:r-28 ${pulseClass}`} 
          onClick={toggleNode}
        />
        <text className="pointer-events-none" dy="5" x="0" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
          {icon}
        </text>
        <text className="rd3t-label__title pointer-events-none" dy="50" x="0" textAnchor="middle">
          {nodeDatum.name}
        </text>
        {nodeDatum.attributes?.version && (
          <text className="rd3t-label__attributes pointer-events-none" dy="65" x="0" textAnchor="middle">
            v{nodeDatum.attributes.version}
          </text>
        )}
        {hasChildren && (
          <g onClick={toggleNode} className="cursor-pointer">
            <rect x="-15" y="-55" width="30" height="15" rx="4" fill="#f1f5f9" stroke="#e2e8f0" />
            <text dy="-44" x="0" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="bold">
              {nodeDatum.__rd3t.collapsed ? `+${nodeDatum.children.length}` : '−'}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Audit Results</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-slate-500">Analysis completed for {summary.totalPackages} dependencies.</span>
            {summary.vulnerabilities > 0 && <Badge variant="danger">{summary.vulnerabilities} Security Risks</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
           <nav className="flex bg-slate-100 p-1 rounded-lg">
             <button 
                onClick={() => setActiveView('table')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeView === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
             >
               List
             </button>
             <button 
                onClick={() => setActiveView('tree')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeView === 'tree' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
             >
               Tree
             </button>
             <button 
                onClick={() => setActiveView('cicd')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeView === 'cicd' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
             >
               Automation
             </button>
           </nav>
          
          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <button 
                    onClick={exportToJson}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Download JSON
                  </button>
                  <button 
                    onClick={exportToCsv}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Download CSV
                  </button>
                </div>
              </>
            )}
          </div>

          <button 
            onClick={onReset}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all">
          <p className="text-sm font-medium text-slate-500">Health Score</p>
          <div className="flex items-end gap-2">
            <p className={`text-4xl font-bold ${summary.healthScore > 80 ? 'text-emerald-500' : summary.healthScore > 50 ? 'text-amber-500' : 'text-red-500'}`}>
              {summary.healthScore}%
            </p>
            <div className="flex-1 h-2 bg-slate-100 rounded-full mb-2 overflow-hidden">
               <div className={`h-full ${summary.healthScore > 80 ? 'bg-emerald-500' : summary.healthScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${summary.healthScore}%` }} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all">
          <p className="text-sm font-medium text-slate-500">Vulnerabilities</p>
          <p className="text-4xl font-bold text-red-500">{summary.vulnerabilities}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all">
          <p className="text-sm font-medium text-slate-500">Outdated</p>
          <p className="text-4xl font-bold text-amber-500">{summary.outdated}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all">
          <p className="text-sm font-medium text-slate-500">Deprecated</p>
          <p className="text-4xl font-bold text-indigo-500">{summary.deprecated}</p>
        </div>
      </div>

      {activeView === 'table' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold mb-6 text-slate-800">Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-2 bg-indigo-50 border border-indigo-100 p-6 rounded-xl shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-indigo-900">Expert AI Analysis</h3>
                  <div className="mt-2 text-indigo-800 leading-relaxed whitespace-pre-wrap italic bg-white/50 p-4 rounded-lg border border-indigo-100">
                    "{generalAdvice}"
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Detailed Findings</h3>
                <p className="text-xs text-slate-500">Interactive table of identified dependency issues.</p>
              </div>
              
              <div className="flex items-center gap-2">
                <label htmlFor="severity-filter" className="text-sm font-medium text-slate-600">Filter:</label>
                <select 
                  id="severity-filter"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as Severity | 'ALL')}
                  className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="ALL">All Levels</option>
                  <option value={Severity.CRITICAL}>Critical</option>
                  <option value={Severity.HIGH}>High</option>
                  <option value={Severity.MEDIUM}>Medium</option>
                  <option value={Severity.LOW}>Low</option>
                  <option value={Severity.INFO}>Info</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 w-8"></th>
                    <th className="px-6 py-4">Package</th>
                    <th className="px-6 py-4">Issue</th>
                    <th className="px-6 py-4">Severity</th>
                    <th className="px-6 py-4">Remediation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDetails.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No packages match the current filter.</td>
                    </tr>
                  ) : filteredDetails.map((pkg, i) => (
                    <React.Fragment key={i}>
                      <tr 
                        className={`cursor-pointer transition-colors ${expandedRows.has(i) ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}
                        onClick={() => toggleRow(i)}
                      >
                        <td className="px-6 py-4">
                          <svg className={`h-4 w-4 text-slate-400 transition-transform ${expandedRows.has(i) ? 'rotate-90 text-indigo-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{pkg.name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{pkg.currentVersion}</div>
                        </td>
                        <td className="px-6 py-4"><Badge variant={getIssueTypeVariant(pkg.issueType)}>{pkg.issueType}</Badge></td>
                        <td className="px-6 py-4"><Badge variant={getSeverityVariant(pkg.severity)}>{pkg.severity}</Badge></td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                             <code className="bg-slate-800 text-slate-100 px-2 py-1 rounded text-xs truncate max-w-[200px]">{pkg.remediation}</code>
                             <button onClick={(e) => { e.stopPropagation(); copyToClipboard(pkg.remediation, `rem-${i}`); }} className="text-slate-400 hover:text-indigo-500 p-1">
                               {copied === `rem-${i}` ? '✓' : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
                             </button>
                           </div>
                        </td>
                      </tr>
                      {expandedRows.has(i) && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="px-8 py-6 border-l-4 border-indigo-500">
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 text-sm">
                              <div><h4 className="font-bold text-slate-700 uppercase tracking-wider mb-1 text-xs">Summary</h4><p className="text-slate-600 leading-relaxed">{pkg.description}</p></div>
                              <div className="grid grid-cols-2 gap-4">
                                <div><h4 className="font-bold text-slate-700 uppercase tracking-wider mb-1 text-xs">Current</h4><p className="font-mono text-slate-600">{pkg.currentVersion}</p></div>
                                <div><h4 className="font-bold text-slate-700 uppercase tracking-wider mb-1 text-xs">Suggested</h4><p className="font-mono text-indigo-600 font-bold">{pkg.suggestedVersion}</p></div>
                              </div>
                              {pkg.links && pkg.links.length > 0 && (
                                <div>
                                  <h4 className="font-bold text-slate-700 uppercase tracking-wider mb-1 text-xs">References</h4>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {pkg.links.map((link, li) => (
                                      <a key={li} href={link} target="_blank" className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg> 
                                        {new URL(link).hostname}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeView === 'tree' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-[650px] overflow-hidden relative group">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] text-slate-500 font-bold uppercase tracking-widest flex gap-4">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Vulnerable</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Outdated</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy</span>
            </div>
          </div>
          <Tree 
            data={dependencyTree as any} 
            orientation="vertical"
            pathFunc="step"
            translate={{ x: 400, y: 100 }}
            nodeSize={{ x: 220, y: 160 }}
            shouldCollapseNeighborNodes={true}
            renderCustomNodeElement={renderNodeWithCustomEvents}
            separation={{ siblings: 1.5, nonSiblings: 2 }}
          />
        </div>
      )}

      {activeView === 'cicd' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* GitHub and GitLab blocks as before, with refined copy buttons */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white">
                      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                   </div>
                   <div>
                      <h3 className="text-xl font-bold">GitHub Actions</h3>
                      <p className="text-xs text-slate-500">Automate audits on every PR.</p>
                   </div>
                </div>
                <button onClick={() => copyToClipboard('github action code', 'gh')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Copy YAML</button>
             </div>
             <pre className="p-4 bg-slate-900 text-indigo-300 rounded-xl overflow-x-auto text-xs font-mono">
                {githubActionYaml}
             </pre>
             <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Requirement:</strong> Add your Gemini API Key to your repository secrets as <code className="bg-amber-100 px-1 rounded">GEMINI_API_KEY</code>.
              </p>
            </div>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-[#e24329] rounded-lg flex items-center justify-center text-white">
                      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.417-.724-.417-.859 0L16.425 9.452H7.575L4.91 1.263c-.135-.417-.724-.417-.859 0L1.387 9.452.045 13.587c-.114.352.016.74.321.961l11.634 8.45 11.633-8.45c.306-.221.436-.609.322-.961"/></svg>
                   </div>
                   <div>
                      <h3 className="text-xl font-bold">GitLab CI</h3>
                      <p className="text-xs text-slate-500">Integrate into your pipeline.</p>
                   </div>
                </div>
                <button onClick={() => copyToClipboard('gitlab ci code', 'gl')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Copy YAML</button>
             </div>
             <pre className="p-4 bg-slate-900 text-indigo-300 rounded-xl overflow-x-auto text-xs font-mono">
                {gitlabCiYaml}
             </pre>
             <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-800 leading-relaxed">
                Add the <code className="bg-indigo-100 px-1 rounded">GEMINI_API_KEY</code> to your project's CI/CD Variables.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditDashboard;
