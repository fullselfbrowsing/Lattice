# Build the Lattice IEEE paper.
#
# Requires a TeX distribution (TeX Live or MiKTeX) that provides latexmk and the
# IEEEtran document class. IEEEtran.cls ships with standard TeX distributions, so
# it does not need to be vendored.

MAIN := main

.PHONY: all pdf clean distclean

all: pdf

pdf:
	latexmk -pdf -interaction=nonstopmode -halt-on-error $(MAIN).tex

clean:
	latexmk -c $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).blg

distclean:
	latexmk -C $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).blg
