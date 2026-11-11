// Minimal local integration of github.com/mustafarslan/janus evidence log.
// One workload payload is appended, the log is sealed on Close, then verified
// offline with verify.SegmentDir. This is not the full orchestrator.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/mustafarslan/janus/pkg/evidence"
	"github.com/mustafarslan/janus/pkg/evidence/keys"
	"github.com/mustafarslan/janus/pkg/evidence/verify"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: janus-wrap append|verify")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "append":
		appendCmd(os.Args[2:])
	case "verify":
		verifyCmd(os.Args[2:])
	default:
		fmt.Fprintln(os.Stderr, "unknown command")
		os.Exit(2)
	}
}

func appendCmd(args []string) {
	fs := flag.NewFlagSet("append", flag.ExitOnError)
	dir := fs.String("dir", "", "segment directory")
	payload := fs.String("payload", "", "payload file")
	pubOut := fs.String("pub", "", "hex public key output")
	keyOut := fs.String("key", "", "writer key path")
	_ = fs.Parse(args)
	body, err := os.ReadFile(*payload)
	must(err)
	signer, err := keys.Generate()
	must(err)
	if *keyOut != "" {
		must(signer.Save(*keyOut))
	}
	t0 := time.Now()
	app, err := evidence.Open(evidence.Options{Dir: *dir, Signer: signer})
	must(err)
	ref, err := app.Append(context.Background(), evidence.Request{
		Kind:    evidence.KindStepResult,
		SagaID:  "lattice-eval",
		StepID:  "workload",
		TraceID: "lattice-eval",
		Participant: evidence.ParticipantRef{
			ID: "lattice-eval", ManifestVersion: "0", Principal: "eval", Kind: "AGENT",
		},
		Payload: body,
	})
	must(err)
	must(app.Close())
	elapsed := time.Since(t0)
	pubDoc, _ := json.Marshal(map[string]string{
		"key_id": signer.KeyID(),
		"public": hex.EncodeToString(signer.Public()),
	})
	must(os.WriteFile(*pubOut, pubDoc, 0o644))
	enc, _ := json.Marshal(map[string]any{
		"ms":       elapsed.Milliseconds(),
		"event_id": ref.EventID,
		"seq":      ref.Seq,
		"key_id":   signer.KeyID(),
	})
	fmt.Println(string(enc))
}

func verifyCmd(args []string) {
	fs := flag.NewFlagSet("verify", flag.ExitOnError)
	dir := fs.String("dir", "", "segment directory")
	pubHex := fs.String("pub", "", "hex public key file")
	_ = fs.Parse(args)
	raw, err := os.ReadFile(*pubHex)
	must(err)
	var doc struct {
		KeyID  string `json:"key_id"`
		Public string `json:"public"`
	}
	must(json.Unmarshal(raw, &doc))
	pub, err := hex.DecodeString(doc.Public)
	must(err)
	t0 := time.Now()
	report, err := verify.SegmentDir(*dir, verify.Options{
		Keys: keys.PublicKeySet{doc.KeyID: ed25519.PublicKey(pub)},
	})
	must(err)
	critical := 0
	for _, f := range report.Findings {
		if f.Severity == verify.Critical {
			critical++
		}
	}
	enc, _ := json.Marshal(map[string]any{
		"ms":       time.Since(t0).Milliseconds(),
		"critical": critical,
		"findings": report.Findings,
		"ok":       critical == 0,
	})
	fmt.Println(string(enc))
	if critical > 0 {
		os.Exit(1)
	}
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
