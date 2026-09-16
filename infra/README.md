# Top Table hosting

One CloudFormation stack (`hosting.yaml`) creates everything Top Table needs to be a
website: hosted zone, ACM certificate, S3 bucket, CloudFront distribution, two IAM roles
and the alias record. See KB-7 ("Hosting and deployment") for why it is shaped this way.

**The wait is the design.** A first deploy that sits at `AWS::CertificateManager::Certificate`
in `CREATE_IN_PROGRESS` is waiting for step 3 below. It is not broken. It does not want
restarting — restarting risks the failure mode in the first paragraph of "Recovering a
failed apply" below, where a second hosted zone gets created out from under the first.

## The first apply, exactly

This is the one deploy that happens from a laptop. Every apply after it goes through
`.github/workflows/infrastructure.yml`, because the infrastructure role that workflow
assumes is created by this stack — it does not exist until the stack has been applied
once.

All commands: `--profile AdministratorAccess-920373033530 --region us-east-1`.

0. **Preflight.**
   ```
   aws sts get-caller-identity
   ```
   Confirms the identity is account `920373033530`.
   ```
   aws s3api head-bucket --bucket toptable-site
   ```
   Must return **404**, not 403 — 403 means the name is taken by another account.
   ```
   aws cloudformation describe-stacks --stack-name toptable-hosting
   ```
   Must return "does not exist".
   ```
   aws route53 list-hosted-zones-by-name --dns-name toptable.enablis.tech
   ```
   Must return no zone. **If it returns one, stop.** A zone already exists — from a
   previous apply of this stack that was later deleted — and the correct move is an
   **import** changeset (`aws cloudformation create-change-set --change-set-type IMPORT`),
   never a plain create. Creating a second zone leaves the root-account delegation
   pointing at nameservers nobody's zone answers to any more; see "Recovering a failed
   apply" below.

1. **Apply.**
   ```
   aws cloudformation deploy \
     --template-file infra/hosting.yaml \
     --stack-name toptable-hosting \
     --parameter-overrides file://infra/parameters.json \
     --capabilities CAPABILITY_NAMED_IAM \
     --region us-east-1
   ```

2. **Read the nameservers from the zone, not from the stack.** While step 1 is still
   running, in another terminal:
   ```
   aws route53 list-hosted-zones-by-name --dns-name toptable.enablis.tech
   aws route53 get-hosted-zone --id <ZONE_ID> --query 'DelegationSet.NameServers'
   ```
   `describe-stacks --query Outputs` is empty until the stack reaches
   `CREATE_COMPLETE`, which is *after* the certificate validates — exactly the moment
   you need the nameservers for.

3. **Delegate, in the root account.** This needs root-account credentials, which are not
   available in this session. In the `enablis.tech` hosted zone, create an `NS` record
   named `toptable` with the four nameservers from step 2, TTL 300.

4. **Verify the delegation before waiting any longer.**
   ```
   dig +short NS toptable.enablis.tech @8.8.8.8
   ```
   Must return the same four nameservers. If it returns nothing, step 3 has not
   propagated yet and ACM is still blind — do not proceed to assume the stack is stuck.

5. **Let it finish.** DNS validation usually completes within minutes once the
   delegation is live. The distribution then creates behind it, which alone takes
   roughly 5 to 15 minutes. The stack stays busy for a while after the certificate goes
   green — also not a hang.

6. **Record the outputs.**
   ```
   aws cloudformation describe-stacks --stack-name toptable-hosting \
     --query 'Stacks[0].Outputs'
   ```
   Then create the four GitHub Actions environments and set their variables — see
   "The environments" below.

7. **Prove it serves.** Build and upload by hand, once:
   ```
   npm run build
   aws s3 sync dist/ s3://toptable-site/ --cache-control no-cache
   aws cloudfront create-invalidation --distribution-id <ID> --paths '/*'
   ```
   `--cache-control no-cache` throughout is deliberate here, even though it is not the
   final caching strategy. A plain `aws s3 sync` sets no `Cache-Control`, and the
   CachingOptimized policy then applies its default 86,400-second TTL to `index.html`.
   When TT-42 makes the first real publish with its proper hashed-assets/no-cache split,
   returning browsers would otherwise hold this one-off's cached `index.html` and ask
   for asset hashes that no longer exist — a white screen that looks like TT-42's fault.
   TT-42 owns the real two-pass split; this step just avoids poisoning it.

   Then run the verification checklist below.

## Recovering a failed apply

`ROLLBACK_COMPLETE` must be deleted before the stack can be created again — CloudFormation
will not update out of it. `UPDATE_ROLLBACK_FAILED` needs
`aws cloudformation continue-update-rollback --stack-name toptable-hosting` before anything
else can proceed. Find the failing resource and why:

```
aws cloudformation describe-stack-events --stack-name toptable-hosting \
  --query 'StackEvents[?contains(ResourceStatus, `FAILED`)].[LogicalResourceId,ResourceStatusReason]'
```

## Deleting the stack

Empty the bucket first — a stack delete fails on a non-empty bucket, since the bucket
itself carries no `DeletionPolicy`.

**The hosted zone survives on purpose** (`DeletionPolicy: Retain` and
`UpdateReplacePolicy: Retain`). Its nameservers are what the root-account delegation
points at; a zone deleted and recreated is handed different ones, and the site goes dark
in a way that reads as a certificate problem, not a DNS one.

The next apply after a delete **must import** the retained zone
(`create-change-set --change-set-type IMPORT`) rather than create a fresh one. A plain
create at that point succeeds, reaches `CREATE_COMPLETE`, and leaves the delegation
pointing at a zone with no alias record — a deploy that looks like it worked and does not
resolve.

## The environments and what each holds

Four GitHub Actions environments, not three or two:

| Environment | Holds | Gated |
|---|---|---|
| `production` | `AWS_REGION`, `AWS_ROLE_ARN` (publish role), `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `SITE_URL` | No |
| `preview` | Same shape as `production` | No |
| `infra-plan` | `AWS_REGION`, `AWS_ROLE_ARN` (infrastructure role), `STACK_NAME` | No |
| `infra-apply` | Same shape as `infra-plan` | **Yes — required reviewers** |

Only `infra-apply` is gated. A GitHub Actions protected environment holds every job that
declares it, so:

- Gating `preview` would park every push to an open pull request behind a manual
  approval before anyone could look at the preview it is meant to unblock.
- Gating `infra-plan` would deadlock: the changeset job needs the infrastructure role to
  produce the changeset a reviewer is waiting to read, so it would sit waiting for the
  same approval its own output is meant to inform.

`infra-plan` and `infra-apply` therefore carry the same values under different names so
that the read-only changeset job and the gated apply job can each declare the
environment appropriate to what they do.

```bash
gh api --method PUT repos/enablis-co/TopTable/environments/production
gh api --method PUT repos/enablis-co/TopTable/environments/preview
gh api --method PUT repos/enablis-co/TopTable/environments/infra-plan
gh api --method PUT repos/enablis-co/TopTable/environments/infra-apply \
  --field 'reviewers[][type]=User' --field 'reviewers[][id]=<your-user-id>'

for env in production preview; do
  gh variable set AWS_REGION --env "$env" --body us-east-1
  gh variable set AWS_ROLE_ARN --env "$env" --body <PublishRoleArn>
  gh variable set S3_BUCKET --env "$env" --body <BucketName>
  gh variable set CLOUDFRONT_DISTRIBUTION_ID --env "$env" --body <DistributionId>
  gh variable set SITE_URL --env "$env" --body <SiteUrl>
done

for env in infra-plan infra-apply; do
  gh variable set AWS_REGION --env "$env" --body us-east-1
  gh variable set AWS_ROLE_ARN --env "$env" --body <InfraRoleArn>
  gh variable set STACK_NAME --env "$env" --body toptable-hosting
done
```

## Verification checklist

Run once, during the first apply. Every item observes a deployed resource — never the
template that produced it.

| # | Check | Expected |
|---|---|---|
| V1 | `aws cloudformation describe-stacks --stack-name toptable-hosting --region us-east-1` | `CREATE_COMPLETE`, one stack |
| V2 | `aws route53 get-hosted-zone --id <ZONE_ID> --query 'DelegationSet.NameServers'` vs. the stack's `NameServers` output | Four nameservers, and the two agree |
| V3 | `aws acm describe-certificate --region us-east-1 --certificate-arn <ARN>` | `ISSUED`, `DNS` validation, domain `toptable.enablis.tech` |
| V4 | `dig +short toptable.enablis.tech` and `dig +short AAAA toptable.enablis.tech` | Both answer with CloudFront addresses |
| V5 | `aws s3api get-bucket-website --bucket toptable-site` | `IndexDocument: index.html`, **no** `ErrorDocument` |
| V6 | `aws cloudfront get-distribution-config --id <ID>`, read `Origins.Items[0].DomainName` | Contains **`s3-website`**. No `OriginAccessControlId`, no `S3OriginConfig`, no OAI |
| V7 | Same config, read `DefaultCacheBehavior.OriginRequestPolicyId` | Absent, or a policy that does not forward `Host` |
| V8 | `curl -sSI http://toptable.enablis.tech/` | `301`, `location: https://toptable.enablis.tech/` |
| V9 | `curl -sS https://toptable.enablis.tech/` after the step-7 upload | `200`, body is the app's `index.html` with `<div id="root">` |
| V10 | Load it in a browser | The app renders; a scenario loads (exercises `BASE_URL` against the real origin) |
| V11 | `curl -sS https://toptable.enablis.tech/robots.txt` | `200`, body contains `Disallow: /tt-` |
| V12 | Upload one throwaway `tt-0/index.html`, then `curl -sSI https://toptable.enablis.tech/tt-0/`, then delete the file | **`200`**, not `404` |
| V13 | `aws iam simulate-principal-policy` for `toptable-publish` on `iam:CreateRole`, `s3:PutBucketPolicy`, `cloudformation:UpdateStack` | `implicitDeny` for all three |
| V14 | Same, on `s3:PutObject` against `toptable-site/*` and `cloudfront:CreateInvalidation` against the distribution | `allowed` |
| V15 | Read `toptable-publish`'s trust policy | `sub` condition ends `:*`, not narrowed to `refs/heads/main` |
| V16 | `gh variable list --env <env>` for each of the four environments | Bucket, distribution id, role ARN, site URL and region all present where they should be |
| V17 | `gh api /repos/enablis-co/TopTable/environments` | Required reviewers on `infra-apply` only |
| V18 | `gh secret list` (repository and each environment); `grep -rn 'AKIA' .` | No AWS access keys anywhere |

**V12 is the one that earns its place.** It is the only check that catches the origin
mistake this template warns about twice. Get the origin wrong (REST endpoint, OAC) and
V9 still returns 200, because `DefaultRootObject` rescues `/` and only `/`: CloudFront
hands `/tt-0/` to the S3 REST API, which has no concept of an index document on a
prefix and 404s. V12 fails the moment the origin is wrong, here, rather than later when
somebody opens their first real preview under TT-43.

## Not built here

Publishing `main` (`aws s3 sync`, the hashed/no-cache split, `--delete --exclude
'tt-*/*'`, invalidation) is **TT-42**. Preview builds, the `--base=/tt-nn/` prefix taken
from the branch name, and deleting a preview when its pull request closes are **TT-43**.
Neither is built by this stack or this workflow.
