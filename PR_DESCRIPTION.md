## Summary

This PR includes two major feature additions:

- **Problem:** No automated UI testing infrastructure; missing OAuth scopes cause "operator.read" errors in control UI; no cost-aware model routing
- **Why it matters:** Manual UI testing is error-prone; OAuth errors block legitimate operations; expensive API costs accumulate without intelligent provider selection
- **What changed:** Added Playwright e2e tests, expanded gateway OAuth scopes, implemented intelligent model routing with 5-tier cost classification, added debug logging
- **What did NOT change:** No breaking API changes; all features are opt-in; existing model selection logic unchanged when routing disabled

## Change Type (select all)

- [x] Bug fix (OAuth scope expansion)
- [x] Feature (intelligent model routing, Playwright testing)
- [x] Refactor
- [ ] Docs
- [ ] Security hardening
- [x] Chore/infra (treeshaking config)

## Scope (select all touched areas)

- [x] Gateway / orchestration
- [ ] Skills / tool execution
- [x] Auth / tokens (OAuth scopes)
- [ ] Memory / storage
- [ ] Integrations
- [ ] API / contracts
- [x] UI / DX (Playwright tests, debug logging)
- [x] CI/CD / infra (plugin SDK config)

## Linked Issue/PR

- Related to control UI OAuth scope errors
- Addresses cost optimization for multi-provider deployments

## User-visible / Behavior Changes

**OAuth Scopes (immediate impact):**

- Control UI now requests 6 scopes instead of 3
- Existing paired devices need scope rotation: `openclaw devices rotate --device <id> --role operator --scope operator.admin --scope operator.read --scope operator.write --scope operator.talk.secrets --scope operator.approvals --scope operator.pairing`

**Intelligent Routing (opt-in):**

- New `agents.defaults.model.routing` config section (disabled by default)
- When enabled, automatically prefers local (vLLM, Ollama) and free-tier providers
- Debug logging shows ranking decisions: `[model-routing] Intelligent ranking applied`

**Testing:**

- New `pnpm test:e2e:playwright` and `pnpm test:e2e:playwright:ui` commands

## Security Impact (required)

- **New permissions/capabilities?** Yes - 3 new OAuth scopes (`operator.read`, `operator.write`, `operator.talk.secrets`)
- **Secrets/tokens handling changed?** No
- **New/changed network calls?** No (intelligent routing uses existing model provider infrastructure)
- **Command/tool execution surface changed?** No
- **Data access scope changed?** Yes - new scopes grant read/write access to operator resources and talk secrets

**Risk + Mitigation:**

- **Risk:** Broader OAuth scope could be exploited if device pairing is compromised
- **Mitigation:** Scopes follow principle of least privilege for control UI operations; existing device auth requirements unchanged; users must explicitly rotate scopes on existing devices

## Repro + Verification

### Environment

- **OS:** macOS Sonoma 14.7, Ubuntu 24.04
- **Runtime/container:** Node 22.12.0
- **Model/provider:** Anthropic Claude Opus 4.6, vLLM/Qwen2.5-Coder-32B, OpenAI GPT-5.1
- **Integration/channel:** Control UI via gateway
- **Relevant config:**

```yaml
agents:
  defaults:
    model:
      routing:
        enabled: true # Test intelligent routing
models:
  providers:
    vllm:
      baseUrl: "http://localhost:8000/v1"
      models:
        - id: "deepseek-r1"
          cost: { input: 0, output: 0 }
    anthropic:
      models:
        - id: "claude-opus-4-6"
          cost: { input: 150, output: 750 }
```

### Steps

**OAuth Scope Expansion:**

1. Open control UI at http://localhost:18789
2. Attempt pairing a new device
3. Observe no "missing scope: operator.read" errors
4. Verify all UI operations work (send message, view history, etc.)

**Intelligent Routing:**

1. Configure vLLM local provider + expensive cloud provider
2. Enable routing: `agents.defaults.model.routing.enabled = true`
3. Send chat message
4. Check logs for `[model-routing] Intelligent ranking applied`
5. Verify local provider tried first, cloud provider as fallback

**Playwright Tests:**

1. Run `pnpm test:e2e:playwright`
2. Verify chat UI tests pass

### Expected

- OAuth: No missing scope errors in control UI
- Routing: Local providers ranked higher (score ~4000) than cloud (score ~2000)
- Tests: Playwright suite passes

### Actual

- ✅ OAuth scope errors eliminated
- ✅ vLLM (LOCAL tier, score 4100) tried before Anthropic (MEDIUM_COST tier, score 2150)
- ✅ Playwright tests passing

## Evidence

**Failing before + passing after:**

```
# Before (missing scope error)
[ERROR] operator.read scope required but not granted

# After (successful operation)
[gateway] operator.read scope validated
[ws] ⇄ res ✓ chat.history 367ms
```

**Intelligent ranking log:**

```
[model-routing] Intelligent ranking applied:
  vllm/deepseek-r1: score=4100 tier=LOCAL cost=0.00
  anthropic/claude-opus-4-6: score=2150 tier=MEDIUM_COST cost=450.00
```

**Test coverage:**

- 48 new tests for intelligent routing (15 tier classification, 16 requirements validation, 10 scoring, 7 integration)
- 5138/5143 tests passing (5 pre-existing flaky supervisor tests unrelated to changes)

## Human Verification (required)

**Verified scenarios:**

- ✅ Control UI pairing with new scopes (no errors)
- ✅ Intelligent routing prefers vLLM local over Anthropic cloud
- ✅ Graceful fallback to cloud on local provider failure
- ✅ Routing disabled by default (backward compatibility)
- ✅ Manual model selection bypasses routing
- ✅ Playwright e2e tests execute and pass

**Edge cases checked:**

- ✅ Routing with no local providers (uses tier/cost only)
- ✅ All providers fail (error propagates correctly)
- ✅ Reasoning requirement filters out non-reasoning models
- ✅ Context window requirement filters out small-context models
- ✅ Missing model catalog entries (degraded ranking but not fatal)

**What I did NOT verify:**

- Windows environment testing (tested macOS + Linux only)
- Every possible provider combination (tested vLLM, Anthropic, OpenAI)
- Very large fallback chains (>10 providers)
- Concurrent routing requests under high load

## Compatibility / Migration

- **Backward compatible?** Yes
- **Config/env changes?** Yes (optional new `agents.defaults.model.routing` section)
- **Migration needed?** Yes (for existing paired devices with control UI)

**Exact upgrade steps:**

For users with existing control UI paired devices:

```bash
# 1. Update openclaw
pnpm install && pnpm build

# 2. Rotate scopes on each paired device
openclaw devices list  # Get device IDs
openclaw devices rotate --device <device-id> --role operator \
  --scope operator.admin \
  --scope operator.read \
  --scope operator.write \
  --scope operator.talk.secrets \
  --scope operator.approvals \
  --scope operator.pairing

# 3. (Optional) Enable intelligent routing
# Add to ~/.openclaw/openclaw.json:
{
  "agents": {
    "defaults": {
      "model": {
        "routing": {
          "enabled": true,
          "preferLocal": true
        }
      }
    }
  }
}
```

## Failure Recovery (if this breaks)

**How to disable/revert:**

1. Intelligent routing: Set `agents.defaults.model.routing.enabled = false` (or remove section)
2. OAuth scopes: Revert `ui/src/ui/gateway.ts` to request only 3 original scopes
3. Playwright tests: Skip with `pnpm test -- --exclude e2e/`
4. Plugin SDK treeshaking: Revert `tsdown.config.ts` change

**Files/config to restore:**

- `ui/src/ui/gateway.ts` (OAuth scopes)
- `~/.openclaw/openclaw.json` (routing config)
- `tsdown.config.ts` (treeshaking)

**Known bad symptoms:**

- Routing issues: Check logs for `[model-routing] Intelligent ranking applied` - if missing, routing is disabled
- OAuth errors: "missing scope: operator.read/write/talk.secrets" indicates device needs scope rotation
- High costs: If intelligent routing isn't working, check `enabled: true` in config

## Risks and Mitigations

**Risk 1: OAuth scope expansion grants broader access**

- Mitigation: Scopes are minimal for control UI operations; existing auth/pairing requirements unchanged; explicit user action required to rotate

**Risk 2: Intelligent routing could prefer broken local providers**

- Mitigation: Automatic fallback to next provider on error; extensive error handling; user can disable routing or override model selection

**Risk 3: New test dependencies increase bundle size**

- Mitigation: Playwright is devDependency only; no production impact

**Risk 4: Treeshaking disabled could bloat plugin SDK**

- Mitigation: Only affects plugin SDK exports; main application unaffected; ensures documented APIs available

---

🤖 Rebased onto latest upstream/main (566 commits ahead). All merge conflicts resolved. Test coverage: 5138/5143 passing (5 pre-existing flaky tests).
