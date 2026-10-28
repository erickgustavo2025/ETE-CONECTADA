# Temporary RSA JWK bounds backport

Source: github.com/go-jose/go-jose/v3 v3.0.5, Apache-2.0; original LICENSE and
copyright notices retained. Runtime sources are unchanged except jwk.go.
This is a locally patched dependency, not an upstream v3 security release.

CVE-2026-116587 / GHSA-mgcc-cww5-fp2q affects v3.0.5. Upstream has no fixed v3
tag. Its v4.1.6 security commit a0111f82742fa92bceec9ede40845e73319e6230
bounds RSA modulus to 4096 bits and checks prime sizes/product before calling
crypto/rsa.PrivateKey.Validate. Those same checks are backported here at the
shared rawJSONWebKey RSA constructors, protecting direct JSON parsing and
embedded JWS/JWE keys. No cryptographic algorithm has been reimplemented.
The separate v4 dependency is upgraded to upstream v4.1.6.

All other v3 runtime source files match the official module archive. Only
runtime sources/license/module metadata and our regression test are retained;
upstream tests are run separately against this copy during validation.
Builds run our boundary regressions before compiling Caddy. A local Go module
replacement can make version-only scanners unable to classify this copy;
therefore a zero scanner result alone is not evidence that this backport works.
Require source comparison, regression tests and real proxy validation too.

The default cap intentionally rejects RSA keys above 4096 bits, matching the
upstream fix. The proxy uses configured EC certificates and no JWK intake or
public internal-CA provisioning. Existing certificate/HTTP/TLS tests remain
required. Never raise the cap based on request input.

Remove this copy and its replace directive when Caddy's dependency graph has a
compatible official fix. Do not replace v3 with v4 blindly: Smallstep's wrappers
and certificates currently depend on v3 API behavior.

Official advisory: https://github.com/go-jose/go-jose/security/advisories/GHSA-mgcc-cww5-fp2q
Official fix: https://github.com/go-jose/go-jose/commit/a0111f82742fa92bceec9ede40845e73319e6230
