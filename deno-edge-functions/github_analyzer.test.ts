import { 
  assertEquals,
  assertExists
} from "https://deno.land/std@0.217.0/assert/mod.ts";
import { app } from "./github_analyzer.tsx";

// 模拟环境变量
Deno.env.set("GITHUB_TOKEN", "token");

// 为测试创建一个新的服务器实例，使用不同的端口
const TEST_PORT = 8001;
const controller = new AbortController();
const { signal } = controller;

// 在所有测试开始前启动服务器
app.listen({ port: TEST_PORT, signal });

// 辅助函数来检查值是否存在且不为 undefined
function assertDefined<T>(value: T): asserts value is NonNullable<T> {
  assertExists(value, "Value must be defined");
}

Deno.test({
  name: "analyze_repo - should return correct score structure",
  async fn() {
    const testUrl = `/analyze_repo?owner=denoland&repo=deno`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    // 验证响应结构
    assertDefined(data.repoName);
    assertDefined(data.owner);
    assertDefined(data.totalScore);
    assertDefined(data.details);

    // 验证详情字段
    const details = data.details;
    assertDefined(details.stars);
    assertDefined(details.forks);
    assertDefined(details.commits);
    assertDefined(details.starScore);
    assertDefined(details.commitFrequencyScore);
    assertDefined(details.forkScore);

    // 验证分数范围
    assertEquals(data.totalScore >= 0 && data.totalScore <= 100, true);
    assertEquals(details.starScore >= 0 && details.starScore <= 70, true);
    assertEquals(details.commitFrequencyScore >= 0 && details.commitFrequencyScore <= 15, true);
    assertEquals(details.forkScore >= 0 && details.forkScore <= 15, true);
  },
});

Deno.test({
  name: "analyze_repo - should handle invalid input",
  async fn() {
    const testUrl = `/analyze_repo?owner=&repo=`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Owner and repo parameters are required");
  },
});

Deno.test({
  name: "analyze_org - should return correct organization score structure",
  async fn() {
    const testUrl = `/analyze_org?org=denoland`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    // 验证响应结构
    assertDefined(data.analysis);
    assertDefined(data.analysis.score);
    assertDefined(data.analysis.activityRate);
    assertDefined(data.analysis.totalRepos);
    assertDefined(data.analysis.totalSourceRepos);
    assertDefined(data.analysis.totalForkRepos);
    assertDefined(data.analysis.activeRepos);
    assertDefined(data.analysis.topLanguages);
    assertDefined(data.raw_data);

    // 验证源仓库和fork仓库的数量关系
    assertEquals(
      data.analysis.totalRepos,
      data.analysis.totalSourceRepos,
      "Total repos should equal source repos after filtering"
    );
    assertEquals(
      data.analysis.totalSourceRepos + data.analysis.totalForkRepos,
      data.raw_data.publicRepos,
      "Source repos + fork repos should equal total public repos"
    );

    // 验证原始数据
    const rawData = data.raw_data;
    assertDefined(rawData.organizationName);
    assertDefined(rawData.displayName);
    assertDefined(rawData.description);
    assertDefined(rawData.publicRepos);
    assertDefined(rawData.topRepositories);

    // 验证分数范围
    assertEquals(data.analysis.score >= 0 && data.analysis.score <= 100, true);
    assertEquals(data.analysis.activityRate >= 0 && data.analysis.activityRate <= 100, true);

    // 验证仓库列表
    assertEquals(Array.isArray(rawData.topRepositories), true);
    assertEquals(rawData.topRepositories.length <= 10, true);

    if (rawData.topRepositories.length > 0) {
      const firstRepo = rawData.topRepositories[0];
      assertDefined(firstRepo.name);
      assertDefined(firstRepo.description);
      assertDefined(firstRepo.stars);
      assertDefined(firstRepo.forks);
      assertDefined(firstRepo.commits);
      assertDefined(firstRepo.language);
      assertDefined(firstRepo.score);
      assertDefined(firstRepo.details);
      assertEquals(firstRepo.isFork, false, "Top repositories should not be forks");
    }
  },
});

Deno.test({
  name: "analyze_org - should handle invalid input",
  async fn() {
    const testUrl = `/analyze_org?org=`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Organization name parameter is required");
  },
});

// 测试分数计算逻辑
Deno.test({
  name: "Score calculation - should calculate scores correctly",
  async fn() {
    // 模拟一个仓库数据
    const mockRepoData = {
      stargazers_count: 1000, // 应得到 70 分的 star 分数
      forks_count: 500,       // 应得到 15 分的 fork 分数
    };
    const mockCommits = new Array(150); // 应得到 15 分的提交频率分数

    // 计算分数
    const starScore = (mockRepoData.stargazers_count / 100) * 70;
    const commitFrequencyScore = Math.min(mockCommits.length / 10, 15);
    const forkScore = (mockRepoData.forks_count / 50) * 15;
    const totalScore = Math.min(starScore + commitFrequencyScore + forkScore, 100);

    // 验证分数计算
    assertEquals(starScore, 70);
    assertEquals(commitFrequencyScore, 15);
    assertEquals(forkScore, 15);
    assertEquals(totalScore, 100);
  },
});

Deno.test({
  name: "analyze_user - should return correct user score structure",
  async fn() {
    const testUrl = `/analyze_user?username=denoland`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    // 验证响应结构
    assertDefined(data.analysis);
    assertDefined(data.analysis.score);
    assertDefined(data.raw_data);
    assertDefined(data.raw_data.topRepositories);
    assertDefined(data.raw_data.averageScore);

    // 验证分数范围
    assertEquals(data.analysis.score >= 0 && data.analysis.score <= 100, true);
    assertEquals(data.raw_data.averageScore >= 0 && data.raw_data.averageScore <= 100, true);

    // 验证顶级仓库列表
    assertEquals(Array.isArray(data.raw_data.topRepositories), true);
    assertEquals(data.raw_data.topRepositories.length <= 10, true);

    if (data.raw_data.topRepositories.length > 0) {
      const firstRepo = data.raw_data.topRepositories[0];
      assertDefined(firstRepo.name);
      assertDefined(firstRepo.stars);
      assertDefined(firstRepo.forks);
      assertDefined(firstRepo.commits);
      assertDefined(firstRepo.score);
      assertDefined(firstRepo.details);
    }
  },
});

Deno.test({
  name: "analyze_github - should analyze user URL correctly",
  async fn() {
    const testUrl = `/analyze_github?url=https://github.com/denoland`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    assertDefined(data.type);
    assertDefined(data.data);
    assertEquals(data.type === "User" || data.type === "Organization", true);
  },
});

Deno.test({
  name: "analyze_github - should analyze repository URL correctly",
  async fn() {
    const testUrl = `/analyze_github?url=https://github.com/denoland/deno`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    assertEquals(data.type, "Repository");
    assertDefined(data.data.repoName);
    assertDefined(data.data.totalScore);
  },
});

Deno.test({
  name: "analyze_github - should handle invalid URLs",
  async fn() {
    const testUrl = `/analyze_github?url=https://invalid-url.com`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Invalid GitHub URL");
  },
});

Deno.test({
  name: "analyze_github - should handle missing URL parameter",
  async fn() {
    const testUrl = `/analyze_github`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "GitHub URL parameter is required");
  },
});

// 测试 GitHub URL 分析的更多场景
Deno.test({
  name: "analyze_github - should analyze organization URL correctly",
  async fn() {
    const testUrl = `/analyze_github?url=https://github.com/microsoft`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    assertEquals(data.type, "Organization");
    assertDefined(data.data.analysis);
    assertDefined(data.data.analysis.score);
    assertDefined(data.data.analysis.activityRate);
    assertDefined(data.data.raw_data.organizationName);
    assertDefined(data.data.raw_data.topRepositories);
  },
});

Deno.test({
  name: "analyze_github - should handle various URL formats",
  async fn() {
    const testCases = [
      "https://github.com/denoland",
      "http://github.com/denoland",
      "github.com/denoland",
      "https://www.github.com/denoland",
      "https://github.com/denoland/",
    ];

    for (const url of testCases) {
      const testUrl = `/analyze_github?url=${encodeURIComponent(url)}`;
      const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
      assertEquals(response.status, 200, `Failed for URL: ${url}`);

      const data = await response.json();
      assertDefined(data.type);
      assertDefined(data.data);
    }
  },
});

Deno.test({
  name: "analyze_github - should handle various repository URL formats",
  async fn() {
    const testCases = [
      "https://github.com/denoland/deno",
      "http://github.com/denoland/deno",
      "github.com/denoland/deno",
      "https://www.github.com/denoland/deno",
      "https://github.com/denoland/deno/",
    ];

    for (const url of testCases) {
      const testUrl = `/analyze_github?url=${encodeURIComponent(url)}`;
      const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
      assertEquals(response.status, 200, `Failed for URL: ${url}`);

      const data = await response.json();
      assertEquals(data.type, "Repository");
      assertDefined(data.data.repoName);
      assertDefined(data.data.totalScore);
    }
  },
});

Deno.test({
  name: "analyze_github - should handle invalid GitHub URLs",
  async fn() {
    const invalidUrls = [
      "https://gitlab.com/user/repo",
      "https://github.com/",
      "https://github.com",
      "https://invalid-url.com",
      "not-a-url",
      "https://github.com/a/b/c", // 太多路径段
      "", // 空字符串
      "https://github.com//", // 无效路径
    ];

    for (const url of invalidUrls) {
      const testUrl = `/analyze_github?url=${encodeURIComponent(url)}`;
      const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
      assertEquals(
        response.status,
        400,
        `Expected 400 status for invalid URL: ${url}`
      );

      const data = await response.json();
      assertEquals(data.error, "Invalid GitHub URL");
    }
  },
});

Deno.test({
  name: "analyze_github - should verify score calculations",
  async fn() {
    const testUrl = `/analyze_github?url=https://github.com/denoland/deno`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    const data = await response.json();

    // 验证分数计算
    assertEquals(data.type, "Repository");
    const details = data.data.details;
    
    // 验证分数范围
    assertEquals(details.starScore >= 0 && details.starScore <= 70, true);
    assertEquals(details.commitFrequencyScore >= 0 && details.commitFrequencyScore <= 15, true);
    assertEquals(details.forkScore >= 0 && details.forkScore <= 15, true);
    assertEquals(data.data.totalScore >= 0 && data.data.totalScore <= 100, true);

    // 验证总分计算
    const calculatedTotal = Math.min(
      details.starScore + details.commitFrequencyScore + details.forkScore,
      100
    );
    assertEquals(
      Math.round(calculatedTotal * 100) / 100,
      data.data.totalScore,
      "Total score should match the sum of individual scores (capped at 100)"
    );
  },
});

Deno.test({
  name: "analyze_github - should handle non-existent users/organizations",
  async fn() {
    const testUrl = `/analyze_github?url=https://github.com/this-user-definitely-does-not-exist-12345`;
    const response = await fetch(`http://localhost:${TEST_PORT}${testUrl}`);
    assertEquals(response.status, 500);

    const data = await response.json();
    assertDefined(data.error);
  },
});

// 清理测试
Deno.test({
  name: "cleanup",
  fn() {
    controller.abort(); // 关闭服务器
  },
  sanitizeOps: false,
  sanitizeResources: false,
});