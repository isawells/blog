---
title: "Everything I know about GitLab CI/CD"
date: 2026-10-21
category: tech
tags: [ci-cd, gitlab, devops, yaml]
description: "Opinionated lessons from years of building reusable GitLab CI/CD templates for teams of any size."
cover: ./cover.png
coverAlt: "Illustration of a CI/CD pipeline with build, test and deploy stages"
---

Over the years, I have dedicated most of my time to perfecting the art of configuring reusable CI/CD configs for the masses. I have learned a lot along the way. That includes everything from optimizing the pipeline itself to figuring out the cleanest way to package these configs to reduce maintenance. I will share with you everything I believe you need to know to be successful in building and supporting CI/CD configs, whether you're building them just for your team or for thousands of engineers. I've learned it can be a good thing to be opinionated, especially if you are going to be maintaining these CI/CD configs for thousands of engineers.

## The Basics: Organizational Structures

It's important to label the types of "templates" and when each one should be used. Otherwise, you end up with spaghetti code. Some of these organizational structures aren't documented on any vendor site. They're opinions I've come to depend on.

### Anchors and Hidden Jobs

Anchors look just like GitLab's "Hidden Jobs," but Hidden Jobs use the `extends` or `!reference` keywords when they are used in a job. In this section I will use the word anchors interchangeably with hidden jobs.

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

These are your jobs' shared configs, and they let you follow the DRY (don't repeat yourself) methodology. Don't go crazy and start creating anchors for things just 'cause you think it looks pretty. You should only have an anchor if more than one job needs the same config. Otherwise, adding anchors unnecessarily creates strain on job/pipeline startup and makes the merged YAML a nightmare to parse through.

Never encourage users to override anchors. Let me say it again. Never encourage users to override anchors. Anchors are meant to be used by config maintainers to optimize the code. Maintainers should be able to delete, rename, or completely change the contents of the anchors as they please. Anything a maintainer adds to an anchor is deep merged in GitLab, so you end up with a hodgepodge of both the maintainer's and the user's configs. Any override of a hidden job may impact multiple jobs in the pipeline, and the user may not be aware of them. It's a nightmare, and one I am never going to support. If I see someone overriding anchors from a CI/CD template they are using, my first suggestion is going to be to delete everything.

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

Jobs are where your units of work execute. A CI/CD pipeline is composed of jobs. Each job accomplishes a single task in support of the development life cycle.

```yaml
gradle-unit-test:
  stage: test
  image: gradle:8.10-jdk21
  script:
    - gradle test
```

Similar to anchors, I would not recommend that users override a job, but I stress it a lot less. Job names should be more permanent. Maintainers (in my experience) aren't going to delete or rename a job without labeling it as a breaking change.

[GitLab docs: Jobs](https://docs.gitlab.com/ci/jobs/)

### Task Components

Task components are templates or YAML files that contain one or more jobs in support of a specific tool. For example, a Gradle task component may have jobs for build, unit test, and integration test. All of those jobs would go under a single "task component" because they support the same tool. This organizational structure is helpful because each of those jobs will probably use the same image, setup scripts, or variables. Users who need Gradle will also likely need all three of those jobs in their pipeline.

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

Task components should be able to be included independently of other task components. This lets users with lightweight projects add just a single task component for their unique use case. They don't have to take on the bulk of a pipeline component (which we will get into in a sec).

```yaml
# .gitlab-ci.yml for a small project
include:
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1.4.2
```

Task components should not have too many nested includes. An extra include under a task component can help support the DRY method. But with too many nested includes, you are likely to hit the 150 include limit over time. It also makes the merged YAML a nightmare to read and makes tracing down configuration difficult.

### Pipeline Components

Pipeline components are templates or YAML files made up of more than one task component. They contain all of the tasks required to support a specific stack, from building in the dev environment all the way to production deploy. The pipeline component wires up all the required needs or dependencies across jobs.

Task components that make up a pipeline component should always be pinned to the full semantic version. Otherwise, you get into a maintenance nightmare. The same goes for users. If users are combining more than one task component and creating dependencies between them, those task components must be pinned to immutable versions. This will save both the user and the maintainer headaches when a maintainer is iterating on a task component. It lets pipeline maintainers and users test out the change when they are ready to use it. For a user, this is especially important on release nights, when you expect your pipeline to work before a production deploy.

```yaml
include:
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1.4.2    # good: full version
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@1        # risky: moves with every 1.x release
  - component: $CI_SERVER_FQDN/my-org/gradle/gradle@~latest  # please no
```

Pipeline components will default certain jobs to off, set default variables, or set default spec inputs for the user. When defaulting a task component to off, it is important to use rules on the include instead of variables within the job's rules. This makes it easier for GitLab to spin up the pipeline, since it doesn't have to read in all the extra YAML from that task component.

```yaml
# Avoid: the job's YAML still gets processed, then skipped
sonar-scan:
  rules:
    - if: $SONAR_ENABLED == "true"
```

All task components should set needs as spec inputs in their jobs. This lets pipeline maintainers safely configure dependencies across jobs without directly overriding jobs or resorting to the forsaken anchor override.

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

Both task and pipeline components are organizational structures I have come up with underneath GitLab's ["CI/CD Component"](https://docs.gitlab.com/ci/components/).

## Next Up: Variables vs. Spec Inputs

I remember when GitLab first came out with spec inputs, and it completely blew my mind. It took me months to figure out how I might use them, and a few months more to come up with solid standards for them across jobs, tasks, and pipeline components. To this day, I may not have it perfect, but I'll share my opinions nonetheless.

### Variables

Oh, variables. Here is a little haiku for how I feel about CI/CD variables:

> You set them here now\
> Someone sets them elsewhere now\
> Nothing works but why?

It's horrible. Both my haiku and what will happen if you don't get your variable definitions under control.

In short, never use global variables. This goes double for a pipeline component, unless you want the variable to affect the behavior of multiple jobs across the pipeline. Even then, I would look for any other solution before resorting to a global variable. It's messy and confusing, and it can create a maintenance nightmare later on. You can't easily change it without impacting multiple CI/CD projects. In a perfect world, my users have no variables defined in their .gitlab-ci.yml.

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

Spec inputs are beautiful. They let you scope inputs to a single template file. You explicitly grant people access to modify a certain config by exposing it as a spec input. You can then pass that input through as many levels as you want, depending on how you want to scope it. (Notice how `java_version` flows from the pipeline component down into the Gradle task component in the example above.)

You may be wondering, why don't I make everything a spec input in my task component?

And this is how you end up with 700 lines of spec before your actual CI/CD configs start.

My recommendation to you is: be opinionated. Your users, or even your pipeline maintainers, don't need access to modify every single one of your configs. Decide what you believe should be overridable by pipelines and what you want your users to be able to modify. Your users probably shouldn't be overriding the image, so don't create a spec input for it.

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

Ask yourself: Why would a user need to modify this? Why would a pipeline need to modify this? What happens if I don't let them modify this?

Most of the time, you are going to find that you don't actually need to surface something as a spec input.

Spec inputs are read in at pipeline compile time, while variables are read in both at compile time and at run time. Variables should be used to dynamically pass information from one job to another, or within scripts. Spec inputs should be used for just about everything else.

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

Other small opinions include:

- I never set a workflow, and I never recommend that people set one: [GitLab docs: workflow](https://docs.gitlab.com/ci/yaml/workflow/). It's not a good idea when configuring multi-template solutions. Instead, create a standard for job rules across your components so users never have to worry about configuring their own workflows.
- Needs should be defaulted to empty so your job executes immediately. If a job doesn't have a dependency, it should run right away. Aim for a stageless pipeline, or as few stages as possible. Your jobs shouldn't be waiting for their stage to run. They should only be waiting for their dependencies.
- If you have more than 20 inputs, you should consider reviewing them or doing a redesign.
- If you are having to rewrite the same script in multiple templates, it should probably go in an image instead.
- Testing is increasingly important in today's age of AI. Make sure your templates include automated testing.

While this guide is heavily geared toward GitLab, I imagine most of these opinions translate over to other source code management tools. I will be learning GitHub Workflows and Actions this year, so keep an eye out for a similar post for GitHub in the near future.
