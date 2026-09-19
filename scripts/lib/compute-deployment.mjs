/** Keep the operator's current scale when updating the worker code. */
export function deployedInstanceCount(status) {
  const instances = status.declared_instances ?? status.instances?.declared;
  if (!Number.isInteger(instances) || instances < 1) {
    throw new Error('Compute instance count unavailable; provision the initial service explicitly');
  }
  return instances;
}
