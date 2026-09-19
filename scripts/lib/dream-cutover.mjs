/** Stop new Edge claims, finish current work, and deploy one Compute worker. */
export async function cutoverDreams({ setMode, activeRuns, deploy, wait, maxPolls = 120 }) {
  await setMode('compute');
  try {
    for (let poll = 0; poll < maxPolls; poll += 1) {
      if ((await activeRuns()) === 0) {
        await deploy();
        return;
      }
      await wait();
    }
    throw new Error('Edge Dream work did not finish before the cutover deadline');
  } catch (error) {
    await setMode('edge');
    throw error;
  }
}
