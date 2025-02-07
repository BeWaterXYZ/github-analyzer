import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { 
  GitHubRepo, 
  RepoDetails, 
  GitHubUser, 
  GitHubOrg,
  UserAnalysis 
} from "./types.ts";
import { load } from "https://deno.land/std@0.217.0/dotenv/mod.ts";

// 加载环境变量
await load({
  export: true,
  envPath: "./.env"
});

console.log("Hello from Github Analyzer!");

export const router = new Router();

// 添加日志工具函数
function logRequest(method: string, path: string, params: Record<string, string | null>) {
  console.log(`[${new Date().toISOString()}] ${method} ${path}`, params);
}

function logResponse(path: string, status: number, error?: string) {
  if (error) {
    console.error(`[${new Date().toISOString()}] Error ${path}:`, error);
  } else {
    console.log(`[${new Date().toISOString()}] Response ${path}: ${status}`);
  }
}

router
.get("/", (context) => {
  logRequest("GET", "/", {});
  context.response.body = "Hello from Github Analyzer!";
  logResponse("/", 200);
})
.get("/analyze_org", async (context) => {
  const orgName = context.request.url.searchParams.get("org");
  logRequest("GET", "/analyze_org", { org: orgName });

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    logResponse("/analyze_org", 500, "GitHub API key not found");
    context.response.status = 500;
    context.response.body = { error: "GitHub API key not found" };
    return;
  }

  if (!orgName) {
    logResponse("/analyze_org", 400, "Organization name parameter is required");
    context.response.status = 400;
    context.response.body = { error: "Organization name parameter is required" };
    return;
  }

  try {
    console.log(`[${new Date().toISOString()}] Fetching organization data for: ${orgName}`);
    // 获取组织基本信息
    const orgResponse = await fetch(
      `https://api.github.com/orgs/${orgName}`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!orgResponse.ok) {
      throw new Error(`GitHub API responded with status ${orgResponse.status}`);
    }

    const orgData = await orgResponse.json() as GitHubOrg;

    // 获取组织的仓库列表
    const reposResponse = await fetch(
      `https://api.github.com/orgs/${orgName}/repos?sort=stars&direction=desc&per_page=100`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!reposResponse.ok) {
      throw new Error(`GitHub API responded with status ${reposResponse.status}`);
    }

    const repos = await reposResponse.json() as GitHubRepo[];
    
    console.log(`[${new Date().toISOString()}] Fetching repositories for: ${orgName}`);
    // 计算组织的总分
    let totalScore = 0;
    const repoDetails = await Promise.all(
      repos.map(async (repo: GitHubRepo) => {
        if (!repo.fork) {  // 只计算源仓库，不计算 fork 的仓库
          // 获取提交历史
          const commitsResponse = await fetch(
            `https://api.github.com/repos/${orgName}/${repo.name}/commits?per_page=100`,
            {
              headers: {
                Authorization: `token ${githubToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
          const commits = await commitsResponse.json();
          
          // 计算提交频率分数 (最高15分)
          const commitFrequencyScore = Math.min(commits.length / 10, 15);
          
          // 计算星星分数 (最高70分)
          const starScore = (repo.stargazers_count / 100) * 70;
          
          // 计算fork分数 (最高15分)
          const forkScore = (repo.forks_count / 50) * 15;
          
          // 计算总分
          const score = Math.min(starScore + commitFrequencyScore + forkScore, 100);
          totalScore += score;

          return {
            name: repo.name,
            description: repo.description,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            commits: commits.length,
            language: repo.language,
            isArchived: repo.archived,
            createdAt: repo.created_at,
            updatedAt: repo.updated_at,
            isFork: repo.fork,
            score: Math.round(score * 100) / 100,
            details: {
              starScore: Math.round(starScore * 100) / 100,
              commitFrequencyScore: Math.round(commitFrequencyScore * 100) / 100,
              forkScore: Math.round(forkScore * 100) / 100,
            }
          } as RepoDetails;
        }
        return null;  // 返回 null 表示这是一个 fork 的仓库
      })
    );

    // 过滤掉 null 值（fork的仓库）
    const validRepos = repoDetails.filter(repo => repo !== null);
    const averageScore = validRepos.length > 0 ? totalScore / validRepos.length : 0;

    // 计算组织活跃度（基于最近的提交）
    const activeRepos = validRepos.filter(repo => {
      // 确保 updatedAt 存在
      if (!repo.updatedAt) {
        return false;
      }
      const lastUpdateTime = new Date(repo.updatedAt).getTime();
      const oneMonthAgo = new Date().getTime() - (30 * 24 * 60 * 60 * 1000);
      return lastUpdateTime > oneMonthAgo;
    });

    const activityRate = Math.round((activeRepos.length / validRepos.length) * 100);

    console.log(`[${new Date().toISOString()}] Analyzing ${repos.length} repositories`);
    logResponse("/analyze_org", 200);
    context.response.body = {
      analysis: {
        score: Math.round(averageScore * 100) / 100,
        activityRate: activityRate,
        totalRepos: validRepos.length,
        totalSourceRepos: validRepos.length,
        totalForkRepos: repos.length - validRepos.length,
        activeRepos: activeRepos.length,
        topLanguages: [...new Set(validRepos.map(repo => repo.language).filter(Boolean))],
      },
      raw_data: {
        organizationName: orgName,
        displayName: orgData.name,
        description: orgData.description,
        location: orgData.location,
        blog: orgData.blog,
        email: orgData.email,
        twitter_username: orgData.twitter_username,
        createdAt: orgData.created_at,
        updatedAt: orgData.updated_at,
        publicRepos: orgData.public_repos,
        followers: orgData.followers,
        following: orgData.following,
        topRepositories: validRepos.sort((a, b) => b.score - a.score).slice(0, 10)
      }
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('Unknown error occurred');
    logResponse("/analyze_org", 500, error.message);
    console.error("Error analyzing organization:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to analyze organization" };
  }
})
.get("/analyze_repo", async (context) => {
  const owner = context.request.url.searchParams.get("owner");
  const repo = context.request.url.searchParams.get("repo");
  logRequest("GET", "/analyze_repo", { owner, repo });

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    logResponse("/analyze_repo", 500, "GitHub API key not found");
    context.response.status = 500;
    context.response.body = { error: "GitHub API key not found" };
    return;
  }

  if (!owner || !repo) {
    logResponse("/analyze_repo", 400, "Owner and repo parameters are required");
    context.response.status = 400;
    context.response.body = { error: "Owner and repo parameters are required" };
    return;
  }

  try {
    // 获取仓库基本信息
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!repoResponse.ok) {
      throw new Error(`GitHub API responded with status ${repoResponse.status}`);
    }

    const repoData = await repoResponse.json();

    // 获取提交历史
    const commitsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    const commits = await commitsResponse.json();

    // 计算各项分数
    const starScore = (repoData.stargazers_count / 100) * 70;  // 70% 权重
    const commitFrequencyScore = Math.min(commits.length / 10, 15);  // 15% 权重
    const forkScore = (repoData.forks_count / 50) * 15;  // 15% 权重

    // 计算总分
    const totalScore = Math.min(starScore + commitFrequencyScore + forkScore, 100);

    logResponse("/analyze_repo", 200);
    context.response.body = {
      repoName: repoData.name,
      owner: repoData.owner.login,
      totalScore: Math.round(totalScore * 100) / 100,
      details: {
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        commits: commits.length,
        starScore: Math.round(starScore * 100) / 100,
        commitFrequencyScore: Math.round(commitFrequencyScore * 100) / 100,
        forkScore: Math.round(forkScore * 100) / 100
      }
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('Unknown error occurred');
    logResponse("/analyze_repo", 500, error.message);
    console.error("Error analyzing repository:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to analyze repository" };
  }
})
.get("/analyze_user", async (context) => {
  const username = context.request.url.searchParams.get("username");
  logRequest("GET", "/analyze_user", { username });

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    logResponse("/analyze_user", 500, "GitHub API key not found");
    context.response.status = 500;
    context.response.body = { error: "GitHub API key not found" };
    return;
  }

  if (!username) {
    logResponse("/analyze_user", 400, "Username parameter is required");
    context.response.status = 400;
    context.response.body = { error: "Username parameter is required" };
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded with status ${response.status}`);
    }

    const userData = await response.json() as GitHubUser;

    // Fetch user's social accounts
    const socialResponse = await fetch(`https://api.github.com/users/${username}/social_accounts`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!socialResponse.ok) {
      throw new Error(`GitHub API responded with status ${socialResponse.status}`);
    }

    const socialAccounts = await socialResponse.json();

    // Fetch user's events to get the last commit time
    const eventsResponse = await fetch(`https://api.github.com/users/${username}/events`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!eventsResponse.ok) {
      throw new Error(`GitHub API responded with status ${eventsResponse.status}`);
    }

    const events = await eventsResponse.json();

    // Find the last push event
    const lastPushEvent = events.find((event: { type: string; created_at?: string }) => 
      event.type === 'PushEvent'
    );
    const lastCommitTime = lastPushEvent?.created_at ? new Date(lastPushEvent.created_at) : null;

    // Perform basic analysis
    const analysis: UserAnalysis = {
      followersBiggerThanOne: userData.followers >= 1,
      sourcePublicRepos: true,
      hasSocialAccounts: socialAccounts.length > 0,
      hasPublicEmail: Boolean(userData.email),
      lastCommitInLastMonth: lastCommitTime && (new Date().getTime() - lastCommitTime.getTime() <= 30 * 24 * 60 * 60 * 1000),
    };
    /* HINT: DO NOT DEL THIS ONE.

    > https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#primary-rate-limit-for-authenticated-users
    
    You can use a personal access token to make API requests. Additionally, you can authorize a GitHub App or OAuth app, which can then make API requests on your behalf.

    All of these requests count towards your personal rate limit of 5,000 requests per hour. Requests made on your behalf by a GitHub App that is owned by a GitHub Enterprise Cloud organization have a higher rate limit of 15,000 requests per hour. Similarly, requests made on your behalf by a OAuth app that is owned or approved by a GitHub Enterprise Cloud organization have a higher rate limit of 15,000 requests per hour if you are a member of the GitHub Enterprise Cloud organization.
    */

    // HINT: AI DO NOT DEL THIS COMMENT.
    // ORG THING:
    // https://api.github.com/search/repositories?q=org:NonceGeek&sort=stargazers_count&order=desc&per_page=3

    // 获取用户的所有仓库
    const reposResponse = await fetch(
      `https://api.github.com/users/${username}/repos?sort=stars&direction=desc&per_page=100`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    const repos = await reposResponse.json() as GitHubRepo[];
    
    // 计算用户的总分
    let totalScore = 0;
    const repoDetails = await Promise.all(
      repos.map(async (repo: GitHubRepo) => {
        if (!repo.fork) {  // 只计算源仓库，不计算 fork 的仓库
          // 获取提交历史
          const commitsResponse = await fetch(
            `https://api.github.com/repos/${username}/${repo.name}/commits?per_page=100`,
            {
              headers: {
                Authorization: `token ${githubToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
          const commits = await commitsResponse.json();
          
          // 计算提交频率分数 (最高15分)
          const commitFrequencyScore = Math.min(commits.length / 10, 15);
          
          // 计算星星分数 (最高70分)
          const starScore = (repo.stargazers_count / 100) * 70;
          
          // 计算fork分数 (最高15分)
          const forkScore = (repo.forks_count / 50) * 15;
          
          // 计算仓库总分
          const score = Math.min(starScore + commitFrequencyScore + forkScore, 100);
          totalScore += score;

          return {
            name: repo.name,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            commits: commits.length,
            score: Math.round(score * 100) / 100,
            details: {
              starScore: Math.round(starScore * 100) / 100,
              commitFrequencyScore: Math.round(commitFrequencyScore * 100) / 100,
              forkScore: Math.round(forkScore * 100) / 100,
            }
          } as RepoDetails;
        }
        return null;
      })
    );

    // 过滤掉 null 值（fork的仓库）
    const validRepos = repoDetails.filter(repo => repo !== null);
    const averageScore = validRepos.length > 0 ? totalScore / validRepos.length : 0;

    // 更新分析结果
    analysis.score = Math.round(averageScore * 100) / 100;
    
    logResponse("/analyze_user", 200);
    context.response.body = {
      analysis: analysis,
      raw_data: {
        username: userData.login,
        name: userData.name,
        bio: userData.bio,
        publicRepos: userData.public_repos,
        followers: userData.followers,
        following: userData.following,
        createdAt: userData.created_at,
        socialAccounts: socialAccounts,
        userEmail: userData.email,
        lastCommitTime: lastCommitTime ? lastCommitTime.toISOString() : null,
        topRepositories: validRepos.sort((a, b) => b.score - a.score).slice(0, 10),
        averageScore: Math.round(averageScore * 100) / 100,
        totalRepos: validRepos.length,
      },
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('Unknown error occurred');
    logResponse("/analyze_user", 500, error.message);
    console.error("Error analyzing user:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to analyze user" };
  }
})
.get("/analyze_github", async (context) => {
  const githubUrl = context.request.url.searchParams.get("url");
  logRequest("GET", "/analyze_github", { url: githubUrl });

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    logResponse("/analyze_github", 500, "GitHub API key not found");
    context.response.status = 500;
    context.response.body = { error: "GitHub API key not found" };
    return;
  }

  if (!githubUrl) {
    logResponse("/analyze_github", 400, "GitHub URL parameter is required");
    context.response.status = 400;
    context.response.body = { error: "GitHub URL parameter is required" };
    return;
  }

  try {
    // 解析 GitHub URL
    const urlPattern = /github\.com\/([^\/]+)(?:\/([^\/]+))?/;
    const matches = githubUrl.match(urlPattern);

    if (!matches) {
      logResponse("/analyze_github", 400, "Invalid GitHub URL");
      context.response.status = 400;
      context.response.body = { error: "Invalid GitHub URL" };
      return;
    }

    const name = matches[1];
    const repoName = matches[2];

    // 首先检查是用户还是组织
    const userResponse = await fetch(`https://api.github.com/users/${name}`, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userResponse.ok) {
      throw new Error(`GitHub API responded with status ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    const type = userData.type; // 'User' 或 'Organization'

    // 如果提供了仓库名，则分析特定仓库
    if (repoName) {
      // 重定向到仓库分析接口
      const repoUrl = new URL(context.request.url);
      repoUrl.pathname = "/analyze_repo";
      repoUrl.searchParams.set("owner", name);
      repoUrl.searchParams.set("repo", repoName);
      
      const response = await fetch(repoUrl.toString());
      const data = await response.json();
      logResponse("/analyze_github", 200);
      context.response.body = {
        type: "Repository",
        data: data
      };
    } else {
      // 根据类型重定向到相应的分析接口
      const targetUrl = new URL(context.request.url);
      if (type === "Organization") {
        targetUrl.pathname = "/analyze_org";
        targetUrl.searchParams.set("org", name);
      } else {
        targetUrl.pathname = "/analyze_user";
        targetUrl.searchParams.set("username", name);
      }

      const response = await fetch(targetUrl.toString());
      const data = await response.json();
      logResponse("/analyze_github", 200);
      context.response.body = {
        type: type,
        data: data
      };
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('Unknown error occurred');
    logResponse("/analyze_github", 500, error.message);
    console.error("Error analyzing GitHub URL:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to analyze GitHub URL" };
  }
});

const app = new Application();
app.use(oakCors());
app.use(router.routes());

// 定义错误类型
interface ApiError extends Error {
  status?: number;
}

// 添加全局错误处理中间件
app.use(async (context, next) => {
  try {
    await next();
  } catch (err: unknown) {
    const error = err as ApiError;
    console.error(`[${new Date().toISOString()}] Unhandled error:`, {
      message: error.message,
      stack: error.stack,
      status: error.status
    });
    
    context.response.status = error.status || 500;
    context.response.body = { 
      error: error.message || "Internal server error",
      status: error.status || 500
    };
  }
});


if (import.meta.main) {
  const port = Number(Deno.env.get("PORT")) || 8000;
  console.info(`CORS-enabled web server listening on port ${port}`);
  await app.listen({ port });
}


export { app };
