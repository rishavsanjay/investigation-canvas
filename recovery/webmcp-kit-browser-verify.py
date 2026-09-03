import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = os.environ.get("WEBMCP_BASE_URL", "http://127.0.0.1:4173/")
REPORT = Path(os.environ.get("WEBMCP_REPORT_PATH", "/tmp/webmcp-kit-verification.json"))
EXPECTED_TOOLS = 48


def main():
    console_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
            args=["--no-sandbox"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.add_init_script(
            """
            window.__registeredTools = [];
            Object.defineProperty(document, 'modelContext', { configurable: true, value: {
              registerTool: async (tool) => { window.__registeredTools.push(tool); },
              getTools: async () => window.__registeredTools
            }});
            """
        )
        page.on(
            "console",
            lambda msg: console_errors.append(f"console {msg.type}: {msg.text}")
            if msg.type == "error"
            else None,
        )
        page.on("pageerror", lambda exc: console_errors.append(f"pageerror: {exc}"))
        page.goto(URL, wait_until="networkidle")

        registered = page.evaluate("window.__registeredTools.map(t => t.name)")
        if len(registered) != EXPECTED_TOOLS:
            raise AssertionError(f"expected {EXPECTED_TOOLS} registered tools, got {len(registered)}: {registered}")
        if len(set(registered)) != len(registered):
            raise AssertionError("duplicate registered WebMCP tool names")

        result = page.evaluate(
            """async () => {
              const store = window.InvestigationCanvas.store;
              const tools = Object.fromEntries(window.__registeredTools.map(t => [t.name, t]));
              const results = {};
              const ui = {};
              const sleep = () => new Promise(r => setTimeout(r, 25));
              const run = async (name, input = {}) => {
                if (!tools[name]) {
                  results[name] = { status: 'failed', error: 'not registered' };
                  return null;
                }
                try {
                  const output = await tools[name].execute(input);
                  results[name] = { status: 'verified' };
                  return output;
                } catch (error) {
                  results[name] = { status: 'failed', error: String(error?.stack || error) };
                  return null;
                }
              };

              const first = store.state.dataset.records[0];
              const second = store.state.dataset.records[1];
              const firstDoc = store.state.dataset.documents[0];
              const firstHyp = store.state.hypotheses[0];
              const firstNode = store.state.dataset.graph.nodes[0];
              const numField = store.state.dataset.numericFields[0];
              const catField = store.state.dataset.keyFields[0];
              const catValue = first[catField];
              const baseFilter = { field: catField, op: 'eq', value: catValue };

              await run('describe_workspace');
              await run('list_records', { limit: 5, offset: 0 });
              await run('query_records', { filters: [], search: '', limit: 5 });
              await run('get_selection');

              await run('set_selection', { recordIds: [first.id, second.id] });
              await sleep();
              ui.selectionBanner = document.querySelectorAll('.selection-banner').length > 0;
              await run('clear_selection');

              await run('get_record', { recordId: first.id });
              await run('select_where', { filters: [baseFilter], search: '', limit: 10 });
              await run('focus_record', { recordId: first.id });
              await run('focus_evidence', { evidenceId: firstDoc.id });

              await run('add_filter', baseFilter);
              await sleep();
              ui.filterChip = document.querySelectorAll('.filter-chip').length > 0;
              const filterId = store.state.filters.at(-1)?.id;
              if (filterId) await run('remove_filter', { filterId });
              else results.remove_filter = { status: 'failed', error: 'add_filter produced no filter id' };

              await run('set_record_search', { query: String(first.id) });
              await run('set_record_search', { query: '' });
              await run('compare_queries', { groupAFilters: [], groupBFilters: [] });
              await run('summarize_records', { scope: 'visible' });

              await run('set_selection', { recordIds: [first.id, second.id] });
              await run('compare_selection_to_rest');
              await run('rank_discriminating_features', { limit: 5 });
              await run('rank_correlations', { targetField: numField });
              await run('find_outliers', { field: numField, zThreshold: 1.5, limit: 5 });
              await run('clear_filters');
              await run('configure_view', {
                x: store.state.dimensions.x,
                y: store.state.dimensions.y,
                color: store.state.dimensions.color,
                size: store.state.dimensions.size,
                time: store.state.dimensions.time
              });

              const evidenceQuery = String(firstDoc.title || firstDoc.source || 'evidence').split(/\\s+/)[0];
              await run('search_evidence', { query: evidenceQuery });
              await run('get_evidence', { evidenceIds: [firstDoc.id] });
              await run('get_relationship_graph', {});
              await run('focus_graph_node', { nodeId: firstNode.id });
              await run('list_hypotheses');

              const createdHyp = await run('create_hypothesis', {
                title: 'WebMCP Kit verification hypothesis',
                confidence: 51,
                status: 'testing',
                questions: ['Can the seeded evidence falsify this?'],
                notes: 'Created only in local seeded verification.'
              });
              if (createdHyp?.id) {
                await run('update_hypothesis', {
                  hypothesisId: createdHyp.id,
                  confidence: 58,
                  status: 'testing',
                  notes: 'Updated by browser verification.'
                });
                await run('attach_evidence_to_hypothesis', {
                  hypothesisId: createdHyp.id,
                  evidenceId: firstDoc.id,
                  stance: 'supporting'
                });
              } else {
                results.update_hypothesis = { status: 'failed', error: 'create_hypothesis returned no id' };
                results.attach_evidence_to_hypothesis = { status: 'failed', error: 'create_hypothesis returned no id' };
              }
              await sleep();
              const hypothesesTab = document.querySelector('[data-tab="hypotheses"]');
              if (hypothesesTab) hypothesesTab.click();
              await sleep();
              ui.hypothesisVisible = document.body.innerText.includes('WebMCP Kit verification hypothesis');

              await run('annotate_workspace', {
                targetType: 'record', targetId: first.id,
                text: 'WebMCP Kit verification annotation', tone: 'note'
              });
              const saved = await run('save_analysis_view', { name: 'WebMCP Kit verification view' });
              if (saved?.id) await run('restore_analysis_view', { viewId: saved.id });
              else results.restore_analysis_view = { status: 'failed', error: 'save_analysis_view returned no id' };
              const branch = await run('branch_investigation', { name: 'WebMCP Kit verification branch' });
              if (branch?.id) await run('restore_investigation_branch', { branchId: branch.id });
              else results.restore_investigation_branch = { status: 'failed', error: 'branch_investigation returned no id' };
              await run('get_activity_provenance', { limit: 20 });

              await run('get_canvas_state');
              const createdCanvas = await run('create_canvas_view', {
                type: 'summary', title: 'WebMCP Kit verification canvas view',
                content: 'Visible artifact created by a browser agent.', x: 160, y: 120, w: 480, h: 260
              });
              if (createdCanvas?.id) {
                await run('update_canvas_view', { viewId: createdCanvas.id, x: 220, y: 155, w: 520, h: 280 });
                await run('focus_canvas_view', { viewId: createdCanvas.id });
                const target = store.state.canvas.views.find(v => v.id !== createdCanvas.id);
                if (target) await run('link_canvas_views', {
                  sourceViewId: createdCanvas.id, targetViewId: target.id, label: 'supports'
                });
                else results.link_canvas_views = { status: 'failed', error: 'no second canvas view available' };
              } else {
                results.update_canvas_view = { status: 'failed', error: 'create_canvas_view returned no id' };
                results.focus_canvas_view = { status: 'failed', error: 'create_canvas_view returned no id' };
                results.link_canvas_views = { status: 'failed', error: 'create_canvas_view returned no id' };
              }
              await run('arrange_canvas', { mode: 'focus' });
              await sleep();
              ui.canvasViewVisible = document.querySelectorAll('.canvas-view').length > 0 &&
                document.body.innerText.includes('WebMCP Kit verification canvas view');

              await run('list_findings');
              await run('create_finding', {
                title: 'WebMCP Kit verified finding',
                text: 'A local seeded verification finding.', confidence: 67,
                evidenceIds: [firstDoc.id]
              });
              await run('add_causal_link', {
                source: firstNode.id, target: firstHyp.id,
                label: 'verification link', confidence: 50
              });
              await run('fork_hypothesis', {
                parentId: firstHyp.id,
                title: 'WebMCP Kit alternative hypothesis',
                forkReason: 'Verification of explicit competing explanations', confidence: 42,
                notes: 'Local seeded verification only.'
              });
              await run('find_counterevidence', { hypothesisId: firstHyp.id, limit: 5 });
              await run('list_rich_evidence', {});

              if (createdCanvas?.id) await run('remove_canvas_view', { viewId: createdCanvas.id });

              const registeredNames = Object.keys(tools).sort();
              for (const name of registeredNames) {
                if (!results[name]) results[name] = { status: 'failed', error: 'registered but verifier did not invoke it' };
              }
              return { registeredNames, results, ui };
            }"""
        )

        failed = {name: info for name, info in result["results"].items() if info.get("status") != "verified"}
        missing_ui = [name for name, ok in result["ui"].items() if not ok]
        report = {
            "base_url": URL,
            "registered_count": len(registered),
            "registered_tools": sorted(registered),
            "tool_results": result["results"],
            "ui_effects": result["ui"],
            "console_errors": console_errors,
            "summary": {
                "verified": sum(1 for x in result["results"].values() if x.get("status") == "verified"),
                "failed": len(failed),
                "could_not_verify": 0,
            },
        }
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2, sort_keys=True))
        browser.close()

    if failed:
        raise AssertionError(f"WebMCP tool failures: {json.dumps(failed, indent=2)}")
    if missing_ui:
        raise AssertionError(f"missing visible UI effects: {missing_ui}")
    if console_errors:
        raise AssertionError("new browser errors:\n" + "\n".join(console_errors))
    print(f"WebMCP Kit verification passed: {len(registered)} tools registered; {report['summary']['verified']} invoked; UI effects={report['ui_effects']}")


if __name__ == "__main__":
    main()
