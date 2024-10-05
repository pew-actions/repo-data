# repo-data Action

A helper action for easily pulling data from repository

Note: The Vault Github Action is a read-only action, and in general
is not meant to modify repository state.

## Authentication by provider
GitHub
------
`env.PEW_GITHUB_APPID`: The application ID to use for GitHub authentication.
This defaults to the PlayEveryWare builder applciation
`env.PEW_GITHUB_KEY`: Private key used for authentication with the GitHub application.

outputs:
`outputs.token`: Token that can be used to fetch from the repository with pew-actions/checkout

GitLab
------

Bitbucket
---------

## File content examples

```yaml
jobs:
    build:
        # ...
        steps:
            # ...
            - name: Get repository data
              uses: pew-actions/repo-data@v1
              with:
                files: |
                    .pew/build.yml | PEW_BUILD ;
                    .pew/Dockerfile | PEW_DOCKERFILE ;
            # ...
```

Retrieved files are available as environment variables or outputs for subsequent steps:
