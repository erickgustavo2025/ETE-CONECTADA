package jose

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"testing"
)

// Exercises public parsing and the private path that reached RSA validation.
func TestRSABoundsAtJSONBoundary(t *testing.T) {
	valid, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(JSONWebKey{Key: valid})
	if err != nil {
		t.Fatal(err)
	}
	var seed map[string]interface{}
	if err := json.Unmarshal(encoded, &seed); err != nil {
		t.Fatal(err)
	}
	oversized := func(bits uint) string {
		n := new(big.Int).Lsh(big.NewInt(1), bits-1)
		n.SetBit(n, 0, 1)
		return base64.RawURLEncoding.EncodeToString(n.Bytes())
	}
	cases := []struct {
		name, field, value, want string
		public                   bool
	}{
		{name: "valid private"}, {name: "valid public", public: true},
		{name: "public modulus above limit", public: true, field: "n", value: oversized(4097), want: "modulus too large"},
		{name: "private modulus above limit", field: "n", value: oversized(4097), want: "modulus too large"},
		{name: "enormous prime", field: "p", value: oversized(16384), want: "p * q != n"},
		{name: "mismatched prime", field: "q", value: "Aw", want: "p * q != n"},
		{name: "zero prime", field: "p", value: "AA", want: "p * q != n"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			key := make(map[string]interface{}, len(seed))
			for k, v := range seed {
				key[k] = v
			}
			if tc.public {
				for _, k := range []string{"d", "p", "q", "dp", "dq", "qi"} {
					delete(key, k)
				}
			}
			if tc.field != "" {
				key[tc.field] = tc.value
			}
			data, err := json.Marshal(key)
			if err != nil {
				t.Fatal(err)
			}
			var parsed JSONWebKey
			err = json.Unmarshal(data, &parsed)
			if tc.want == "" {
				if err != nil {
					t.Fatal(err)
				}
				if !parsed.Valid() {
					t.Fatal("valid RSA key rejected")
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q, got %v", tc.want, err)
			}
		})
	}
}
