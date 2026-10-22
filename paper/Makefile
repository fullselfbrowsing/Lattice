# Build the Information Systems Frontiers / design-science paper.
# The IEEE conference version is paper/ieee/main.tex (its own Makefile).
#
# `make` requires latexmk, BibTeX, and the article-class packages (natbib,
# booktabs, tabularx, geometry, hyperref, setspace, mathptmx, tikz).
# `make tectonic` requires only Tectonic, which fetches packages on demand.
#
# Generated inputs (do not edit; see README.md):
#   numbers.tex, eval-tables.tex, Fig2.png-Fig4.png   eval/scripts/06-report.py
#   realworld.tex, realworld-matrix.tex, rw-*.pdf     eval/realworld/scripts/05-charts.py
#   realworld-broad.tex, rw-*.pdf                      eval/realworld/scripts/12-charts.py

MAIN := main

.PHONY: all pdf tectonic check clean distclean

all: pdf

pdf:
	latexmk -pdf -interaction=nonstopmode -halt-on-error $(MAIN).tex

# Tectonic exits 0 on undefined references, so `check` greps the log.
tectonic:
	tectonic -X compile $(MAIN).tex --keep-logs
	@$(MAKE) --no-print-directory check

check:
	@if grep -n "undefined\|Citation" $(MAIN).log; then \
		echo "undefined references or citations in $(MAIN).log"; exit 1; \
	fi

clean:
	-latexmk -c $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).blg $(MAIN).log $(MAIN).aux $(MAIN).out

distclean: clean
	-latexmk -C $(MAIN).tex
