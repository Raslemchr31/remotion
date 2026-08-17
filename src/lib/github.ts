/**
 * Heavy lifting (ffmpeg transcode, Remotion render) runs in GitHub Actions
 * rather than in a Vercel function: Actions has no 300s ceiling, ships ffmpeg
 * preinstalled, and costs nothing on the free minute allowance.
 *
 * The app kicks a workflow off with workflow_dispatch and then forgets about it;
 * the workflow reports back by POSTing to the app with CI_API_KEY.
 */

export type WorkflowName = "normalize.yml" | "render.yml";

function config() {
  const repo = process.env.GITHUB_REPO; // "owner/name"
  const token = process.env.GITHUB_TOKEN;
  const ref = process.env.GITHUB_REF_NAME ?? "main";
  if (!repo || !token) {
    throw new Error(
      "GITHUB_REPO and GITHUB_TOKEN must be set to dispatch workflows. " +
        'GITHUB_REPO looks like "Raslemchr31/remotion".',
    );
  }
  return { repo, token, ref };
}

/**
 * Fires a workflow_dispatch. GitHub answers 204 with an empty body on success,
 * so there is nothing to parse — only a failure to surface.
 *
 * `inputs` values must be strings: the dispatch API rejects numbers and objects.
 */
export async function dispatchWorkflow(
  workflow: WorkflowName,
  inputs: Record<string, string>,
): Promise<void> {
  const { repo, token, ref } = config();
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs }),
      cache: "no-store",
    },
  );

  if (response.status !== 204) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `workflow_dispatch ${workflow} failed: ${response.status} ${response.statusText} ${body}`.trim(),
    );
  }
}
