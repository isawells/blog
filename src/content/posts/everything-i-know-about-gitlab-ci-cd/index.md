---
title: "Everything I know about GitLab CI/CD"
date: 2026-10-21
category: tech
tags: [ci-cd, gitlab, devops, yaml]
description: "Opinionated lessons from years of building reusable GitLab CI/CD templates for teams of any size."
cover: ./cover.png
coverAlt: "Illustration of a CI/CD pipeline with build, test and deploy stages"
---

Over the years, I've spent most of my time perfecting the art of building reusable CI/CD configs for the masses, and I've learned a lot along the way: everything from optimizing the pipeline itself to finding the cleanest way to package configs so they're easy to maintain. In this post, I'll share everything I believe you need to know to build and support CI/CD configs successfully, whether they're for your own team or for thousands of engineers. One lesson up front: it pays to be opinionated, especially when thousands of engineers depend on what you maintain.

## The Basics: Organizational Structures

It's important to name the types of "templates" you have and define when to use each one. Otherwise, you end up with spaghetti code. Some of these organizational structures aren't documented on any vendor site; they're opinions I've come to depend on.

### Anchors and Hidden Jobs

Anchors look just like GitLab's "hidden jobs," except that a job pulls in a hidden job with the `extends` or `!reference` keyword instead of YAML anchor syntax. In this section, I use "anchors" and "hidden jobs" interchangeably.

```yaml
# A YAML anchor: only works inside the file where it's defined
.gradle-cache: &gradle-cache
  key: gradle-$CI_COMMIT_REF_SLUG
  paths:
    - .gradle/caches

# A hidden job: works across included files
.gradle-base:
  image: gradle:8.10-jdk21
  before_script:
    - ./scripts/setup-gradle.sh

gradle-build:
  extends: .gradle-base
  cache: *gradle-cache
  script:
    - gradle build

gradle-unit-test:
  extends: .gradle-base
  cache: *gradle-cache
  script:
    - gradle test
```

Anchors and hidden jobs hold your jobs' shared config and let you follow DRY (don't repeat yourself). But don't go crazy creating anchors just 'cause you think they look pretty. Only create one when more than one job needs the same config. Unnecessary anchors slow down job and pipeline startup and make the merged YAML a nightmare to read.

Never encourage users to override anchors. Let me say it again: never encourage users to override anchors. Anchors exist so config maintainers can optimize their code, and maintainers should be free to delete, rename, or completely change them. When a user overrides one, GitLab deep merges the user's version with the maintainer's, so you end up with a hodgepodge of both. And because many jobs can extend the same hidden job, a single override can change jobs across the pipeline that the user doesn't even know about. It's a nightmare, and it's one I will never support. If I see someone overriding anchors from a CI/CD template, my first suggestion is going to be to delete all of it.

```yaml
# .gitlab-ci.yml: please don't do this
include:
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1.4.2

.gradle-base:
  before_script:
    - ./my-custom-setup.sh # replaces the template's setup in every job that extends .gradle-base
```

[GitLab docs: YAML anchors](https://docs.gitlab.com/ci/yaml/yaml_optimization/#anchors)

### Jobs

Jobs are where your units of work run. A CI/CD pipeline is made up of jobs, and each job accomplishes a single task in support of the development life cycle.

```yaml
gradle-unit-test:
  stage: test
  image: gradle:8.10-jdk21
  script:
    - gradle test
```

As with anchors, I don't recommend that users override jobs, though I stress it a lot less. Job names are more permanent: in my experience, maintainers don't delete or rename a job without labeling it a breaking change.

[GitLab docs: Jobs](https://docs.gitlab.com/ci/jobs/)

### Task Components

Task components are templates (YAML files) that contain one or more jobs supporting a specific tool. For example, a Gradle task component might have jobs for build, unit test, and integration test. All of those jobs belong in a single task component because they support the same tool. This structure helps because those jobs will probably share the same image, setup scripts, and variables, and users who need Gradle will likely need all three jobs in their pipeline.

```yaml
# templates/gradle/template.yml
spec:
  inputs:
    java_version:
      description: "Java version to build with"
      options: ["17", "21"]
      default: "21"
    build_needs:
      type: array
      default: []
    test_needs:
      type: array
      default:
        - job: gradle-build
          optional: true
---
.gradle-base:
  image: gradle:8.10-jdk$[[ inputs.java_version ]]
  before_script:
    - ./scripts/setup-gradle.sh

gradle-build:
  extends: .gradle-base
  stage: build
  needs: $[[ inputs.build_needs ]]
  script:
    - gradle build

gradle-unit-test:
  extends: .gradle-base
  stage: test
  needs: $[[ inputs.test_needs ]]
  script:
    - gradle test

gradle-integration-test:
  extends: .gradle-base
  stage: test
  needs: $[[ inputs.test_needs ]]
  script:
    - gradle integrationTest
```

Each task component should be includable on its own, independent of other task components. That way, users with lightweight projects can add just the one task component they need without taking on the bulk of a pipeline component (more on those in a sec).

```yaml
# .gitlab-ci.yml for a small project
include:
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1.4.2
```

Keep nested includes in task components to a minimum. An extra include can help keep things DRY, but with too many, you're likely to hit GitLab's 150-include limit over time. They also make the merged YAML a nightmare to read and make it hard to trace where a config comes from.

### Pipeline Components

Pipeline components are templates made up of more than one task component. They contain every task needed to support a specific stack, from building in the dev environment all the way through production deploy, and they wire up all the needs and dependencies between jobs.

The task components inside a pipeline component should always be pinned to a full semantic version. Otherwise, you're in for a maintenance nightmare. The same goes for users: if they combine multiple task components and create dependencies between them, those components must be pinned to immutable versions. Pinning saves users and maintainers headaches while a maintainer iterates on a task component, because everyone downstream can test the change when they're ready to adopt it. For users, this matters most on release nights, when the pipeline just needs to work before a production deploy.

```yaml
include:
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1.4.2    # good: full version
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1        # risky: moves with every 1.x release
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@~latest  # please no
```

Pipeline components often turn certain jobs off by default, set default variables, or set default spec inputs for the user. When you turn a task component off by default, put rules on the include rather than using variables in the job's rules. That way, GitLab doesn't have to process all of that task component's YAML, so the pipeline spins up faster.

```yaml
# Avoid: the job's YAML still gets processed, then skipped
sonar-scan:
  rules:
    - if: $SONAR_ENABLED == "true"
```

Every task component should expose its jobs' needs as spec inputs. That lets pipeline maintainers safely configure dependencies across jobs without overriding jobs directly or resorting to the forsaken anchor override.

Here is what that looks like in a pipeline component:

```yaml
# templates/java-service/template.yml
spec:
  inputs:
    java_version:
      options: ["17", "21"]
      default: "21"
    enable_sonar:
      type: boolean
      default: false
---
include:
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1.4.2
    inputs:
      java_version: $[[ inputs.java_version ]]

  - component: $CI_SERVER_FQDN/my-org/sonar/sonar@2.0.1
    inputs:
      scan_needs:
        - job: gradle-unit-test
          artifacts: true
    rules:
      - if: '"$[[ inputs.enable_sonar ]]" == "true"'

  - component: $CI_SERVER_FQDN/my-org/deploy/deploy@3.2.0
    inputs:
      deploy_needs:
        - gradle-build
        - gradle-unit-test
        - gradle-integration-test
```

And a user gets the whole stack with a few lines:

```yaml
# .gitlab-ci.yml
include:
  - component: $CI_SERVER_FQDN/my-org/java-service/java-service@4.1.0
    inputs:
      enable_sonar: true
```

Task and pipeline components are both organizational structures I've built on top of GitLab's [CI/CD components](https://docs.gitlab.com/ci/components/).

## Next Up: Variables vs. Spec Inputs

I remember when GitLab first released spec inputs. They completely blew my mind. It took me months to figure out how I might use them, and a few more months to come up with solid standards for them across jobs, task components, and pipeline components. I still may not have it perfect, but I'll share my opinions anyway.

### Variables

Oh, variables. Here's a little haiku about how I feel about CI/CD variables:

> You set them here now\
> Someone sets them elsewhere now\
> Nothing works but why?

It's horrible. Both my haiku and what happens if you don't get your variable definitions under control.

In short, avoid global variables, especially in a pipeline component. The only exception is when you actually want a variable to change the behavior of multiple jobs across the pipeline, and even then, I'd try every other option first. Global variables are messy and confusing, and they can become a maintenance nightmare later: you can't easily change one without affecting multiple CI/CD projects. In a perfect world, my users have no variables defined in their `.gitlab-ci.yml` at all.

```yaml
# Avoid: a top-level variable in a component leaks into every job in the user's pipeline
variables:
  GRADLE_OPTS: "-Xmx2g"

# Better: scope it to the jobs that need it
.gradle-base:
  variables:
    GRADLE_OPTS: "-Xmx2g"
```

### Spec Inputs

Spec inputs are beautiful. They're scoped to a single template file, and exposing a config as a spec input explicitly grants people permission to change it. You can then pass that input down through as many levels as you want, depending on how widely you want to scope it. (Notice how `java_version` flows from the pipeline component down into the Gradle task component in the example above.)

You may be wondering: why not make everything in my task component a spec input?

Because that's how you end up with 700 lines of spec before your actual CI/CD config even starts.

My recommendation: be opinionated. Your users, and even your pipeline maintainers, don't need to modify every single config. Decide what pipelines should be able to override and what users should be able to change. For example, your users probably shouldn't be overriding the image, so don't create a spec input for it.

```yaml
# Too much
spec:
  inputs:
    image:
      default: gradle:8.10-jdk21
    before_script:
      type: array
      default: ["./scripts/setup-gradle.sh"]
    build_command:
      default: gradle build
    # ...and 60 more

# Opinionated
spec:
  inputs:
    java_version:
      options: ["17", "21"]
      default: "21"
```

Ask yourself: Why would a user need to modify this? Why would a pipeline need to? What happens if I don't let them?

Most of the time, you'll find you don't actually need to expose it as a spec input.

Spec inputs are read at pipeline compile time, while variables are read at both compile time and run time. Use variables to pass information dynamically from one job to another or within scripts. Use spec inputs for just about everything else.

```yaml
# Passing data from one job to another with a dotenv artifact
gradle-build:
  script:
    - gradle build
    - echo "APP_VERSION=$(gradle -q printVersion)" >> build.env
  artifacts:
    reports:
      dotenv: build.env

deploy:
  needs: [gradle-build]
  script:
    - ./deploy.sh "$APP_VERSION"
```

## Other Opinions

A few smaller opinions:

- I never set a `workflow`, and I never recommend that anyone else does ([GitLab docs: workflow](https://docs.gitlab.com/ci/yaml/workflow/)). It's a bad idea in multi-template setups. Instead, create a standard for job rules across your components so users never have to configure their own workflows.
- Default `needs` to empty so jobs start right away. If a job has no dependencies, it should run immediately. Aim for a stageless pipeline, or as few stages as possible: jobs shouldn't wait on their stage, only on their dependencies.
- If you have more than 20 inputs, consider reviewing them or redesigning the component.
- If you're rewriting the same script in multiple templates, it probably belongs in an image instead.
- Testing matters more than ever in the age of AI. Make sure your templates include automated tests.

While this guide is heavily geared toward GitLab, I imagine most of these opinions carry over to other CI/CD platforms. I'm learning GitHub Actions this year, so keep an eye out for a similar post for GitHub soon.
