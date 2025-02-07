// GitHub API 返回的仓库数据类型
export interface GitHubRepo {
  name: string;
  description: string | null;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

// 处理后的仓库详情数据类型
export interface RepoDetails {
  name: string;
  description?: string | null;
  stars: number;
  forks: number;
  commits: number;
  language?: string | null;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
  isFork: boolean;
  score: number;
  details: {
    starScore: number;
    commitFrequencyScore: number;
    forkScore: number;
  };
}

// GitHub API 返回的用户数据类型
export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  email: string | null;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
  type: "User" | "Organization";
}

// GitHub API 返回的组织数据类型
export interface GitHubOrg {
  login: string;
  name: string | null;
  description: string | null;
  email: string | null;
  blog: string | null;
  location: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

// GitHub Event 类型
export interface GitHubEvent {
  type: string;
  created_at: string;
  // ... 其他事件相关字段
}

// 用户分析结果类型
export interface UserAnalysis {
  followersBiggerThanOne: boolean;
  sourcePublicRepos: boolean;
  hasSocialAccounts: boolean;
  hasPublicEmail: boolean;
  lastCommitInLastMonth: boolean | null;
  score?: number;  // 可选的分数字段
} 