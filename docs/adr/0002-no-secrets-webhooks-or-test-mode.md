# 0002: Catalog-only runtime

The component mirrors unauthenticated catalog endpoints, declares no environment variables and exposes no HTTP routes. Authentication and authorization belong to app wrappers. Settings live in component tables; provider aliases belong to the client.

There is no test-mode API. Tests stub fetch; smoke replaces catalog destinations only in a disposable local copy and uses a local fixture server. The shipped runtime has no test bypass.
