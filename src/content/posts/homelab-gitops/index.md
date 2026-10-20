---
title: "GitOps for a three-node homelab"
date: 2026-09-28
category: tech
tags: [go, kubernetes, gitops, homelab]
description: "Flux, a tiny Go operator, and a cluster that reconciles itself overnight."
repo: https://github.com/example/homelab
stack: [Go, k3s, Flux, Terraform]
---

My homelab used to be a pile of `kubectl apply` commands and good intentions. Now everything lives in one repo, and the cluster pulls its own state.

## The setup

```go
func (r *BackupReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	// snapshot volumes, then check again in 8h
	return ctrl.Result{RequeueAfter: 8 * time.Hour}, nil
}
```

This post has no cover image, so the library shows a generated, Kindle-style cover with the title set in type. The `stack` and `repo` frontmatter fields show up as the line under the title.
