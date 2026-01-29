
import React, { useState, useMemo } from 'react';
import { analyzePackageJson } from './services/geminiService';
import { AuditReport } from './types';
import AuditDashboard from './components/AuditDashboard';

const App: React.FC = () => {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  // Robust regex for popular git hosting platforms
  const PLATFORMS = {
    GITHUB: {
      regex: /github\.com\/([\w-]+)\/([\w.-]+)/i,
      name: 'GitHub',
      tokenHelp: 'Go to Settings > Developer settings > Personal access tokens to create one.'
    },
    GITLAB: {
      regex: /gitlab\.com\/([\w-/]+)\/([\w.-]+)/i,
      name: 'GitLab',
      tokenHelp: 'Go to User Settings > Access Tokens to create a "Personal Access Token".'
    },
    BITBUCKET: {
      regex: /bitbucket\.org\/([\w-]+)\/([\w.-]+)/i,
      name: 'Bitbucket',
      tokenHelp: 'Use an "App Password" (format: username:password) for authentication.'
    }
  };

  const GENERIC_URL_REGEX = /^https?:\/\/.+/;

  const detectedPlatform = useMemo(() => {
    if (PLATFORMS.GITHUB.regex.test(repoUrl)) return 'GITHUB';
    if (PLATFORMS.GITLAB.regex.test(repoUrl)) return 'GITLAB';
    if (PLATFORMS.BITBUCKET.regex.test(repoUrl)) return 'BITBUCKET';
    return null;
  }, [repoUrl]);

  const validateUrl = (url: string): boolean => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return false;
    return GENERIC_URL_REGEX.test(trimmedUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError("Please upload a valid .json file (usually package.json).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      setError(null);
    };
    reader.onerror = () => {
      setError("Unable to read the uploaded file. It may be corrupted or in use by another program.");
    };
    reader.readAsText(file);
  };

  const fetchRepoPackageJson = async () => {
    if (!repoUrl) return;

    if (!validateUrl(repoUrl)) {
      setError("The URL format is invalid. Example: https://github.com/facebook/react");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const cleanUrl = repoUrl.trim().replace(/\/$/, '');
      let apiUrl = '';
      const headers: Record<string, string> = {};
      const selectedBranch = branch.trim() || 'main';
      const platformName = detectedPlatform ? PLATFORMS[detectedPlatform as keyof typeof PLATFORMS].name : 'the server';

      if (detectedPlatform === 'GITHUB') {
        const match = cleanUrl.match(PLATFORMS.GITHUB.regex);
        if (match) {
          const [, owner, repo] = match;
          apiUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${selectedBranch}/package.json`;
          if (token) headers['Authorization'] = `token ${token}`;
        }
      } else if (detectedPlatform === 'GITLAB') {
        const match = cleanUrl.match(PLATFORMS.GITLAB.regex);
        if (match) {
          const [, owner, repo] = match;
          apiUrl = `https://gitlab.com/${owner}/${repo}/-/raw/${selectedBranch}/package.json`;
          if (token) headers['PRIVATE-TOKEN'] = token;
        }
      } else if (detectedPlatform === 'BITBUCKET') {
        const match = cleanUrl.match(PLATFORMS.BITBUCKET.regex);
        if (match) {
          const [, owner, repo] = match;
          apiUrl = `https://bitbucket.org/${owner}/${repo}/raw/${selectedBranch}/package.json`;
          if (token) headers['Authorization'] = `Basic ${token}`;
        }
      } else {
        apiUrl = cleanUrl.endsWith('package.json') ? cleanUrl : `${cleanUrl}/raw/${selectedBranch}/package.json`;
      }

      const response = await fetch(apiUrl, { headers });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Could not find 'package.json' in the ${platformName} repository. Please verify the URL and ensure the branch '${selectedBranch}' exists.`);
        }
        if (response.status === 401 || response.status === 403) {
          const help = detectedPlatform ? PLATFORMS[detectedPlatform as keyof typeof PLATFORMS].tokenHelp : '';
          throw new Error(`Access denied by ${platformName}. If this is a private repository, please provide a Personal Access Token. ${help}`);
        }
        throw new Error(`Connection to ${platformName} failed (Status: ${response.status}). Please check your internet connection or try again later.`);
      }
      
      const data = await response.text();
      setFileContent(data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while trying to fetch the file.");
    } finally {
      setLoading(false);
    }
  };

  const startAnalysis = async () => {
    if (!fileContent) return;
    setLoading(true);
    setError(null);
    try {
      const results = await analyzePackageJson(fileContent);
      setReport(results);
    } catch (err: any) {
      setError(err.message || "Audit failed. The package.json might be too large or complex for the current analysis model.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileContent(null);
    setRepoUrl('');
    setBranch('main');
    setToken('');
    setReport(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold italic">
              N
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">NPM Guard AI</h1>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <a href="https://github.com" target="_blank" className="text-sm font-medium text-slate-500 hover:text-slate-900">Documentation</a>
            <div className="h-4 w-px bg-slate-200" />
            <span className="text-xs text-slate-400">Powered by Gemini 3</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {!report ? (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-extrabold text-slate-900">Secure your dependencies</h2>
              <p className="text-lg text-slate-500">
                AI-powered audit for GitHub, GitLab, and Bitbucket. Supports private repos.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">
                  Option 1: Direct Upload
                </label>
                <div className="relative group">
                  <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" id="package-upload" />
                  <label htmlFor="package-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-indigo-400 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400 group-hover:text-indigo-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-medium text-slate-600">
                      {fileContent ? 'File loaded successfully ✓' : 'Click to select or drop package.json'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-xs font-bold text-slate-400 uppercase">OR</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">
                  Option 2: Import from Git
                </label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-4 relative">
                    <input 
                      type="text" 
                      placeholder="Repository URL (e.g. https://github.com/facebook/react)"
                      className={`w-full px-4 py-3 bg-slate-50 border ${repoUrl && !validateUrl(repoUrl) ? 'border-red-300' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all pr-24`}
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                    />
                    {detectedPlatform && (
                      <span className="absolute right-4 top-3.5 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase">
                        {PLATFORMS[detectedPlatform as keyof typeof PLATFORMS].name}
                      </span>
                    )}
                  </div>
                  
                  <div className="md:col-span-1">
                    <input 
                      type="text" 
                      placeholder="Branch"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <input 
                      type="password" 
                      placeholder="Personal Access Token (for private repos)"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-1">
                    <button 
                      onClick={fetchRepoPackageJson}
                      disabled={!repoUrl || loading}
                      className="w-full h-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 disabled:opacity-50 transition-colors"
                    >
                      Fetch
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm shadow-sm animate-in shake duration-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="space-y-1">
                    <p className="font-bold">Error encountered</p>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              <button 
                onClick={startAnalysis}
                disabled={!fileContent || loading}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-lg"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Auditing...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Run AI Audit
                  </div>
                )}
              </button>
            </div>
          </div>
        ) : (
          <AuditDashboard report={report} onReset={reset} />
        )}
      </main>

      <footer className="py-10 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-slate-400 text-sm">
            © 2025 NPM Guard AI. Secure your supply chain.
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-indigo-500 text-sm transition-colors">Documentation</a>
            <a href="#" className="text-slate-400 hover:text-indigo-500 text-sm transition-colors">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
