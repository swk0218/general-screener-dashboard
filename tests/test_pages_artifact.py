"""Exercise the exact shared workflow guard without network or credentials."""
from pathlib import Path
import unittest
import io
import contextlib
import urllib.error

WORKFLOW = Path('.github/workflows/pages.yml').read_text()
BLOCK = WORKFLOW.split('run: &wait_pages_artifact |\n', 1)[1]
BLOCK = BLOCK.split("          python - <<'PY'\n", 1)[1].split('          PY\n', 1)[0]
NAMESPACE = {'__name__': 'workflow_guard_test'}
exec('\n'.join(line[10:] for line in BLOCK.splitlines()), NAMESPACE)
WAIT = NAMESPACE['wait_for_artifact']


class PagesArtifactTests(unittest.TestCase):
    def artifact(self, **changes):
        value = dict(id=42, name='github-pages-verified-77-2', expired=False,
                     size_in_bytes=200, workflow_run=dict(id=77, head_sha='a' * 40))
        value.update(changes)
        return value

    def run_guard(self, responses, timeout=120):
        clock = [0]
        calls = []
        remaining = list(responses)
        def fetch(budget):
            calls.append(budget)
            value = remaining.pop(0) if len(remaining) > 1 else remaining[0]
            if isinstance(value, Exception):
                raise value
            return value
        def sleep(seconds):
            clock[0] += seconds
        WAIT(fetch, lambda: clock[0], sleep, name='github-pages-verified-77-2',
             artifact_id=42, run_id=77, head='a' * 40, timeout=timeout)
        return clock[0], calls

    def response(self, *rows):
        return dict(total_count=len(rows), artifacts=list(rows))

    def test_absence_then_two_separated_exact_observations(self):
        elapsed, calls = self.run_guard([self.response(), self.response(self.artifact())])
        self.assertEqual(elapsed, 10)
        self.assertEqual(len(calls), 3)

    def test_visibility_must_remain_consecutive(self):
        ready = self.response(self.artifact())
        elapsed, _ = self.run_guard([ready, self.response(), ready, ready])
        self.assertEqual(elapsed, 15)

    def test_old_attempt_name_does_not_collide(self):
        old = self.artifact(id=41, name='github-pages-verified-77-1')
        self.run_guard([self.response(old, self.artifact())])

    def test_duplicate_current_name_is_terminal(self):
        with self.assertRaisesRegex(ValueError, 'NAME_AMBIGUOUS'):
            self.run_guard([self.response(self.artifact(), self.artifact(id=43))])

    def test_wrong_identity_expired_or_empty_is_terminal(self):
        for change in [dict(id=43), dict(id=True), dict(expired=True),
                       dict(size_in_bytes=0), dict(size_in_bytes=True),
                       dict(workflow_run=dict(id=78, head_sha='a' * 40)),
                       dict(workflow_run=dict(id=77, head_sha='b' * 40))]:
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'IDENTITY_MISMATCH'):
                self.run_guard([self.response(self.artifact(**change))])

    def test_malformed_or_incomplete_list_is_terminal(self):
        for response in [[], {}, dict(total_count=101, artifacts=[]),
                         dict(total_count=1, artifacts=[]),
                         dict(total_count=1, artifacts=[None])]:
            with self.subTest(response=response), self.assertRaises(ValueError):
                self.run_guard([response])

    def test_absence_has_a_finite_deadline(self):
        with self.assertRaisesRegex(TimeoutError, 'NOT_READY'):
            self.run_guard([self.response()], timeout=12)

    def test_lookup_errors_are_not_silently_retried(self):
        def failed(_):
            raise PermissionError('TEST_ONLY')
        with self.assertRaises(PermissionError):
            WAIT(failed, lambda: 0, lambda _: None, name='name', artifact_id=42,
                 run_id=77, head='a' * 40)

    def http_error(self, code, headers=None):
        return urllib.error.HTTPError('https://api.github.com/TEST_ONLY', code,
                                      'TEST_ONLY sensitive body', headers or {}, None)

    def test_transient_http_errors_reset_observations(self):
        ready = self.response(self.artifact())
        for code, headers in [(429, {}), (500, {}), (502, {}), (503, {}), (504, {}),
                              (403, {'X-RateLimit-Remaining': '0'}),
                              (403, {'Retry-After': '7'})]:
            with self.subTest(code=code, headers=headers):
                elapsed, calls = self.run_guard([ready, self.http_error(code, headers), ready, ready])
                self.assertEqual(len(calls), 4)
                self.assertGreaterEqual(elapsed, 15)

    def test_http_rejection_is_terminal_and_sanitized(self):
        for code in (401, 403, 404, 422):
            output = io.StringIO()
            with self.subTest(code=code), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                with self.assertRaisesRegex(RuntimeError, '^PAGES_ARTIFACT_HTTP_REJECTED$') as caught:
                    self.run_guard([self.http_error(code)])
                self.assertTrue(caught.exception.__suppress_context__)
                self.assertEqual(output.getvalue(), '')

    def test_rate_limit_wait_is_bounded(self):
        with self.assertRaisesRegex(TimeoutError, 'NOT_READY'):
            self.run_guard([self.http_error(429, {'Retry-After': '999999'})], timeout=12)

    def test_fetch_uses_existing_token_only_in_header(self):
        seen = []
        def opener(request, timeout):
            seen.append(request)
            self.assertEqual(timeout, 3)
            return io.StringIO('{"total_count": 0, "artifacts": []}')
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            fetch = NAMESPACE['artifact_fetcher']('swk0218/general-screener-dashboard', 77, 'TEST_ONLY_TOKEN', opener)
            self.assertEqual(fetch(3), self.response())
        self.assertEqual(seen[0].get_header('Authorization'), 'Bearer TEST_ONLY_TOKEN')
        self.assertNotIn('TEST_ONLY_TOKEN', seen[0].full_url)
        self.assertEqual(output.getvalue(), '')
        self.assertEqual(WORKFLOW.count('GITHUB_TOKEN: ${{ github.token }}'), 2)
        self.assertNotIn('actions: read', WORKFLOW)

    def test_missing_or_malformed_token_never_falls_back_anonymous(self):
        for token in ('', ' ', 'TEST_ONLY\nTOKEN', 'TEST_ONLY\rTOKEN'):
            with self.subTest(token=repr(token)), self.assertRaisesRegex(ValueError, '^PAGES_TOKEN_REQUIRED$'):
                NAMESPACE['artifact_fetcher']('swk0218/general-screener-dashboard', 77, token)

    def test_build_identity_is_reused_by_failed_job_retry(self):
        self.assertIn('artifact_name: ${{ steps.artifact_identity.outputs.name }}', WORKFLOW)
        self.assertIn('artifact_id: ${{ steps.pages_upload.outputs.artifact_id }}', WORKFLOW)
        self.assertIn('artifact_name: ${{ needs.build.outputs.artifact_name }}', WORKFLOW)
        self.assertIn('artifact-ids: ${{ needs.build.outputs.artifact_id }}', WORKFLOW)
        self.assertIn('needs: [build, deploy]', WORKFLOW)
        self.assertEqual(WORKFLOW.count('run: &wait_pages_artifact |'), 1)
        self.assertEqual(WORKFLOW.count('run: *wait_pages_artifact'), 1)
        self.assertIn('name: github-pages-verified-${{ github.run_id }}-${{ github.run_attempt }}', WORKFLOW)
        self.assertIn('artifact_name: github-pages-verified-${{ github.run_id }}-${{ github.run_attempt }}', WORKFLOW)


if __name__ == '__main__':
    unittest.main()

