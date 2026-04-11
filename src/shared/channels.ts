export const IPC_CHANNELS = {
  cancelJob: 'wxapkg:cancel-job',
  getDefaultScanRoot: 'wxapkg:get-default-scan-root',
  jobEvent: 'wxapkg:job-event',
  openPath: 'wxapkg:open-path',
  pickInput: 'wxapkg:pick-input',
  pickOutputDir: 'wxapkg:pick-output-dir',
  pickScanRoot: 'wxapkg:pick-scan-root',
  readOutputTree: 'wxapkg:read-output-tree',
  scanRoot: 'wxapkg:scan-root',
  scanDefaultRoot: 'wxapkg:scan-default-root',
  startUnpack: 'wxapkg:start-unpack',
} as const;
