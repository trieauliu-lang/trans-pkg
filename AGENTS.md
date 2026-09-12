# Agent operation notes

This repository is deployed to the `claw_trap` Alibaba Cloud ECS instance. Never commit API keys, proxy credentials, the local Workbench configuration, `.env`, or files under `data/`.

## Production target

- Public URL: `http://47.105.93.92/`
- Instance ID: `i-m5e0ik9ntbaqiqw418rc`
- Region: `cn-qingdao`
- Login user: `kestrel`
- Repository: `/home/kestrel/trans-pkg`
- Deployment script: `/home/kestrel/scripts/deploy.sh`
- PM2 application: `trans-pkg`
- Required proxy service: `mihomo-trans-pkg.service`

The local Workbench CLI uses the operator's existing `default` profile in `~/.workbench/config.json`. That file contains credentials and must stay outside Git.

## Release workflow

1. Make and verify changes locally.
2. Commit and push `main` to `https://github.com/trieauliu-lang/trans-pkg.git`.
3. Deploy only through the server script:

   ```bash
   workbench exec \
     --instance-id i-m5e0ik9ntbaqiqw418rc \
     --region cn-qingdao \
     --user-name kestrel \
     --timeout 180 \
     --command "/home/kestrel/scripts/deploy.sh"
   ```

4. Verify the public health endpoint, the deployed commit, and PM2 status. Do not overwrite files directly on the server; the Git checkout is the production source of truth.

Workbench commands run in independent shells. Put directory changes and dependent checks in the same remote `--command` when needed. The deployment script already checks the proxy, performs a clean fast-forward pull, runs `npm ci`, builds the frontend, and restarts the PM2 application with its proxy environment.
