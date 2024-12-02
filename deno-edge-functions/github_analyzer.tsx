import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
console.log("Hello from Buidler Analyzer!");

const router = new Router();

router.get("/analyze_user", async (context) => {
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    context.response.status = 500;
    context.response.body = { error: "GitHub API key not found" };
    return;
  }

  const username = context.request.url.searchParams.get("username");
  if (!username) {
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

    const userData = await response.json();

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
    const lastPushEvent = events.find(event => event.type === 'PushEvent');
    const lastCommitTime = lastPushEvent ? new Date(lastPushEvent.created_at) : null;

    // Perform basic analysis
    const analysis = {
      followersBiggerThanOne: userData.followers >= 1,
      // TODO: impl this two.
      hasGithubPages: true,
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

    // Fetch top repositories using search API
    const searchResponse = await fetch(
      `https://api.github.com/search/repositories?q=user:${username}&sort=stargazers_count&order=desc&per_page=10`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`GitHub API responded with status ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const topReposList = searchData.items;

    // Fetch contributors count for each top repo
    const topReposWithDetails = await Promise.all(
      topReposList.map(async (repo) => {
        const contributorsResponse = await fetch(repo.contributors_url, {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        
        const contributors = await contributorsResponse.json();
        const contributorsCount = Array.isArray(contributors) ? contributors.length : 0;

        return {
          name: repo.name,
          stars: repo.stargazers_count,
          about: repo.description || "No description available",
          topics: repo.topics,
          contributorsCount: contributorsCount,
        };
      })
    );

    // Count source (non-fork) repos from total_count
    const sourceRepos = searchData.total_count;
    analysis.sourcePublicRepos = sourceRepos >= 3;

    context.response.body = {
      // TODO: DO NOT DELETE this, simple analysis based on the rule.
      analysis: analysis,
      raw_data: {
        username: userData.login,
        name: userData.name,
        bio: userData.bio, // Add this line to include the user's bio
        publicRepos: userData.public_repos,
        followers: userData.followers,
        following: userData.following,
        createdAt: userData.created_at,
        socialAccounts: socialAccounts,
        userEmail: userData.email,
        lastCommitTime: lastCommitTime ? lastCommitTime.toISOString() : null,
        topLanguages: ["Move", "Rust", "Typescript"],
        topTenRepos: topReposWithDetails,
      },
    };
  } catch (error) {
    console.error("Error analyzing user:", error);
    context.response.status = 500;
    context.response.body = { error: "Failed to analyze user" };
  }
});

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(router.routes());

console.info("CORS-enabled web server listening on port 8000");

await app.listen({ port: 8000 });
