"""
GitHub integration for Office OS.

Provides tool-call interface for agents to update real GitHub repos/projects
based on simulation actions. Agents can create issues, update project boards,
and post status comments.

Setup:
  1. Set env var GITHUB_TOKEN to a GitHub personal access token
  2. Set env var GITHUB_REPO to the target repo (e.g. "owner/repo")
  3. Optionally set GITHUB_PROJECT_NUMBER for project board updates

Usage:
    github = GitHubSync()
    github.create_issue("Bug: login broken", body="Users can't log in")
    github.update_issue(42, state="closed", comment="Fixed in v1.2")
    github.add_project_item(issue_number=42)
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
import urllib.error
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class GitHubIssue:
    """Structured GitHub issue data."""

    number: int = 0
    title: str = ""
    body: str = ""
    state: str = "open"
    labels: list[str] = field(default_factory=list)
    url: str = ""


@dataclass
class GitHubComment:
    """Structured GitHub comment data."""

    issue_number: int = 0
    body: str = ""
    url: str = ""


class GitHubSync:
    """
    Syncs Office OS simulation events to a real GitHub repository.

    Agents can use tool calls to:
    - Create issues for feature requests, bugs, and tasks
    - Update issue state (open/closed)
    - Add comments to track simulation progress
    - Update GitHub project boards

    Usage:
        sync = GitHubSync(repo="owner/repo")
        result = sync.create_issue("Build SSO feature", body="Priority: high")
        sync.add_comment(result.number, "Feature shipped in simulation day 5")
        sync.update_issue(result.number, state="closed")
    """

    def __init__(
        self,
        repo: str | None = None,
        token: str | None = None,
        project_number: int | None = None,
    ):
        self._repo = repo or os.environ.get("GITHUB_REPO", "")
        self._token = token or os.environ.get("GITHUB_TOKEN", "")
        self._project_number = project_number or int(os.environ.get("GITHUB_PROJECT_NUMBER", "0") or "0")
        self._enabled = bool(self._repo and self._token)
        self._api_base = "https://api.github.com"

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _request(self, method: str, path: str, data: dict | None = None) -> dict:
        """Make an authenticated GitHub API request."""
        url = f"{self._api_base}{path}"
        payload = json.dumps(data).encode() if data else None
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if data:
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=payload, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            logger.warning(f"GitHub API {method} {path} failed: {e.code} {error_body[:200]}")
            raise

    def create_issue(
        self,
        title: str,
        body: str = "",
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
    ) -> GitHubIssue:
        """Create a new GitHub issue."""
        if not self._enabled:
            logger.info(f"GitHub sync disabled — would create issue: {title}")
            return GitHubIssue(title=title, body=body)

        data: dict = {"title": title, "body": body}
        if labels:
            data["labels"] = labels
        if assignees:
            data["assignees"] = assignees

        result = self._request("POST", f"/repos/{self._repo}/issues", data)
        issue = GitHubIssue(
            number=result["number"],
            title=result["title"],
            body=result.get("body", ""),
            state=result["state"],
            labels=[l["name"] for l in result.get("labels", [])],
            url=result["html_url"],
        )
        logger.info(f"Created GitHub issue #{issue.number}: {issue.title}")
        return issue

    def update_issue(
        self,
        issue_number: int,
        state: str | None = None,
        title: str | None = None,
        body: str | None = None,
        labels: list[str] | None = None,
        comment: str | None = None,
    ) -> GitHubIssue:
        """Update an existing GitHub issue."""
        if not self._enabled:
            logger.info(f"GitHub sync disabled — would update issue #{issue_number}")
            return GitHubIssue(number=issue_number)

        data: dict = {}
        if state:
            data["state"] = state
        if title:
            data["title"] = title
        if body:
            data["body"] = body
        if labels:
            data["labels"] = labels

        result = self._request("PATCH", f"/repos/{self._repo}/issues/{issue_number}", data)
        issue = GitHubIssue(
            number=result["number"],
            title=result["title"],
            body=result.get("body", ""),
            state=result["state"],
            labels=[l["name"] for l in result.get("labels", [])],
            url=result["html_url"],
        )

        if comment:
            self.add_comment(issue_number, comment)

        logger.info(f"Updated GitHub issue #{issue.number}: state={issue.state}")
        return issue

    def add_comment(self, issue_number: int, body: str) -> GitHubComment:
        """Add a comment to a GitHub issue."""
        if not self._enabled:
            logger.info(f"GitHub sync disabled — would comment on #{issue_number}")
            return GitHubComment(issue_number=issue_number, body=body)

        result = self._request(
            "POST",
            f"/repos/{self._repo}/issues/{issue_number}/comments",
            {"body": body},
        )
        comment = GitHubComment(
            issue_number=issue_number,
            body=result.get("body", ""),
            url=result.get("html_url", ""),
        )
        logger.info(f"Added comment to GitHub issue #{issue_number}")
        return comment

    def list_issues(self, state: str = "open", labels: str = "") -> list[GitHubIssue]:
        """List issues from the repository."""
        if not self._enabled:
            return []

        path = f"/repos/{self._repo}/issues?state={state}&per_page=20"
        if labels:
            path += f"&labels={labels}"
        results = self._request("GET", path)
        return [
            GitHubIssue(
                number=r["number"],
                title=r["title"],
                body=r.get("body", ""),
                state=r["state"],
                labels=[l["name"] for l in r.get("labels", [])],
                url=r["html_url"],
            )
            for r in results
            if "pull_request" not in r  # Exclude PRs
        ]

    def sync_simulation_event(
        self,
        event_type: str,
        title: str,
        detail: str,
        agent_id: str,
        day: int,
    ) -> GitHubIssue | GitHubComment | None:
        """High-level: sync a simulation event to GitHub.

        Maps simulation actions to GitHub operations:
        - SHIP_RELEASE → close feature issues, create release comment
        - BUILD_FEATURE → create feature issue
        - FIX_BUG → create/close bug issue
        - CLOSE_DEAL → create milestone comment
        - ESCALATE_ISSUE → create bug issue with 'customer-reported' label
        """
        if not self._enabled:
            return None

        label_map = {
            "SHIP_RELEASE": ["release", "simulation"],
            "BUILD_FEATURE": ["feature", "simulation"],
            "FIX_BUG": ["bug", "simulation"],
            "CLOSE_DEAL": ["business", "simulation"],
            "ESCALATE_ISSUE": ["bug", "customer-reported", "simulation"],
            "REQUEST_FEATURE": ["feature", "customer-request", "simulation"],
        }

        labels = label_map.get(event_type, ["simulation"])
        body = f"**Agent:** {agent_id}\n**Day:** {day}\n\n{detail}\n\n---\n*Auto-generated by Office OS simulation*"

        if event_type in ("BUILD_FEATURE", "FIX_BUG", "REQUEST_FEATURE", "ESCALATE_ISSUE"):
            return self.create_issue(title=title, body=body, labels=labels)
        elif event_type in ("SHIP_RELEASE", "CLOSE_DEAL"):
            # Post as comment on most recent open issue or create new
            issues = self.list_issues(state="open", labels="simulation")
            if issues:
                return self.add_comment(issues[0].number, body)
            return self.create_issue(title=title, body=body, labels=labels)

        return None
