// modules/github-fetcher.js
import axios from 'axios';

export async function getLatestProjects(username:string, limit = 5) {
  const { data } = await axios.get(
    `https://api.github.com/users/${username}/repos?sort=pushed&per_page=${limit}`
  );
  return data.map((repo: any) => ({
    name: repo.name,
    description: repo.description,
    language: repo.language,
    stars: repo.stargazers_count,
    url: repo.html_url,
    topics: repo.topics,
    repo
  }));
}